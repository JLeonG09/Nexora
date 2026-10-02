/**
 * Cliente HTTP del frontend.
 *
 * Todo el acceso al backend pasa por aqui. Concentra las cinco cosas que
 * si se esparcen por los componentes se olvidan tarde o temprano:
 *
 *  1. Adjuntar la cabecera `X-User-Id` y avisar cuando ya no vale (401).
 *  2. Convertir cualquier fallo en `ApiError` / `NetworkError` tipados.
 *  3. Cortar la peticion si se cuelga (timeout con AbortController).
 *  4. Reintentar solo lo que tiene sentido reintentar: red y 5xx.
 *  5. Enrutar al mock si `VITE_MOCK=true`, sin tocar el codigo de las paginas.
 */

import { MOCK_ENABLED } from '@/config/env'
import { ApiError, NetworkError } from './errors'
import { mockRequest, MockHttpError } from './mock'

/**
 * Cabecera con la que el backend identifica al usuario (`CurrentUserInterceptor`).
 *
 * Nexora no usa contrasenas ni JWT: `POST /api/users` devuelve el id y todas
 * las peticiones posteriores lo mandan en `X-User-Id`. Es un prototipo de
 * demo, asi que el id viaja en claro; en produccion esto lo sustituiria una
 * sesion firmada en servidor.
 */
export const USER_HEADER = 'X-User-Id'

/** Id del usuario cacheado, para no ir a localStorage en cada fetch. */
export const USER_ID_KEY = 'nexora.userId'
/** Datos del usuario cacheados, para pintar la interfaz sin esperar al backend. */
export const USER_KEY = 'nexora.user'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2

/** Peticiones que nunca se reintentan: ya fallaron por una razon del usuario. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409, 422, 428])

/* ------------------------------------------------------------------ */
/* Id de usuario                                                       */
/* ------------------------------------------------------------------ */

let cachedUserId: string | null | undefined

export function getUserId(): string | null {
  if (cachedUserId !== undefined) return cachedUserId
  try {
    cachedUserId = localStorage.getItem(USER_ID_KEY)
  } catch {
    // localStorage puede estar bloqueado (modo privado, iframe). No es fatal.
    cachedUserId = null
  }
  return cachedUserId
}

export function setUserId(userId: string | null): void {
  cachedUserId = userId
  try {
    if (userId) localStorage.setItem(USER_ID_KEY, userId)
    else localStorage.removeItem(USER_ID_KEY)
  } catch {
    /* sin persistencia: la sesion vive solo en memoria */
  }
}

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
  /**
   * Id de usuario explicito. Casi nunca se pasa: si se omite, se usa el de
   * la sesion. Hace falta solo en el login, que aun no tiene sesion.
   */
  userId?: string | null
  signal?: AbortSignal
  timeoutMs?: number
  /** Desactiva los reintentos (util en acciones de escritura). */
  retries?: number
  headers?: Record<string, string>
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
  } = options

  const userId = options.userId !== undefined ? options.userId : getUserId()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  }
  // El cuerpo solo lleva Content-Type si hay algo que enviar: en POST vacio
  // mandarlo rompe algunos filtros de Spring mal configurados.
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (userId) headers[USER_HEADER] = userId

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
        if (response.status === 401) {
          setUserId(null)
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
