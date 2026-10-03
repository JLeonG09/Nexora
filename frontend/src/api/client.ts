/**
 * Cliente HTTP del frontend.
 *
 * Todo el acceso al backend pasa por aqui. Concentra las cinco cosas que
 * si se esparcen por los componentes se olvidan tarde o temprano:
 *
 *  1. Adjuntar `Authorization: Bearer` con el access token de Privy y avisar si ya no vale (401).
 *  2. Convertir cualquier fallo en `ApiError` / `NetworkError` tipados.
 *  3. Cortar la peticion si se cuelga (timeout con AbortController).
 *  4. Reintentar solo lo que tiene sentido reintentar: red y 5xx.
 *  5. Enrutar al mock si `VITE_MOCK=true`, sin tocar el codigo de las paginas.
 */

import { getAccessToken } from '@privy-io/react-auth'

import { MOCK_ENABLED } from '@/config/env'
import { ApiError, NetworkError } from './errors'
import { mockRequest, MockHttpError } from './mock'

/**
 * Datos del usuario cacheados, para pintar la interfaz sin esperar al backend.
 * La credencial es el access token de Privy, no este id.
 */
export const USER_KEY = 'nexora.user'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2

/** Peticiones que nunca se reintentan: ya fallaron por una razon del usuario. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409, 422, 428])

/* ------------------------------------------------------------------ */
/* Id de usuario                                                       */
/* ------------------------------------------------------------------ */

/** Se llama cuando el backend responde 401, para que la app reaccione. */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

/* ------------------------------------------------------------------ */
/* Opciones                                                            */
/* ------------------------------------------------------------------ */

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Desactiva los reintentos (util en acciones de escritura). */
  retries?: number
  headers?: Record<string, string>
  /** No cierra la sesion si el backend responde 401. Lo usa el arranque. */
  quiet401?: boolean
}

/* ------------------------------------------------------------------ */
/* Peticion                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta una peticion y devuelve el cuerpo ya parseado.
 * Lanza `ApiError` para errores HTTP y `NetworkError` si no hubo respuesta.
 */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  if (MOCK_ENABLED) {
    return requestMock<T>(method, path, body)
  }
  return requestHttp<T>(method, path, body, options)
}

async function requestMock<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const { body: payload } = await mockRequest(method, path, body)
    return payload as T
  } catch (err) {
    if (err instanceof MockHttpError) {
      throw new ApiError(
        err.status,
        path,
        {
          timestamp: new Date().toISOString(),
          status: err.status,
          code: err.code,
          message: err.message,
          path,
          details: Object.entries(err.fieldErrors).map(([field, message]) => ({ field, message })),
          traceId: null,
        },
        err.message,
      )
    }
    throw new NetworkError(path, err)
  }
}

async function requestHttp<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const {
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    // Reintentar una escritura que expiró en el navegador la repite en el backend (p. ej. un pago duplicado).
    retries = method.toUpperCase() === 'GET' ? MAX_RETRIES : 0,
    headers: extraHeaders,
    quiet401 = false,
  } = options

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  }
  // El cuerpo solo lleva Content-Type si hay algo que enviar: en POST vacio
  // mandarlo rompe algunos filtros de Spring mal configurados.
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    const token = await getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    // Sin Privy montado (alta manual o mock que igual no llega aqui) no hay token.
  }

  const url = path

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Combina el timeout propio con el AbortSignal de quien llamo (React Query).
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort)

    try {
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
      })

      // 204 y 205 no tienen cuerpo: devolver null en vez de fallar al parsear.
      if (response.status === 204 || response.status === 205) {
        return null as T
      }

      const text = await response.text()
      const payload: unknown = text ? safeJsonParse(text) : null

      if (!response.ok) {
        const apiError = new ApiError(response.status, path, payload)
        if (response.status === 401 && !quiet401) {
          onUnauthorized()
        }
        // 4xx = el reintento daria el mismo error. Solo se insiste en 5xx.
        if (NO_RETRY_STATUS.has(response.status) || !apiError.isServer) {
          throw apiError
        }
        lastError = apiError
      } else {
        return payload as T
      }
    } catch (err) {
      if (err instanceof ApiError && !err.isServer) throw err
      lastError = err
      // Un abort externo (navegacion, cambio de filtro) no se reintenta.
      if (externalSignal?.aborted) throw new NetworkError(path, err)
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }

    // Espera creciente antes del siguiente intento: 300 ms, 900 ms.
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt)))
    }
  }

  if (lastError instanceof ApiError) throw lastError
  throw new NetworkError(path, lastError)
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // El backend devolvio HTML (por ejemplo la pagina de error de Tomcat).
    return { message: text.slice(0, 500) }
  }
}

/* ------------------------------------------------------------------ */
/* Azucares sintacticos                                                */
/* ------------------------------------------------------------------ */

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
}
