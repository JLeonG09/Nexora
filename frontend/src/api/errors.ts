import type { ApiErrorBody, FieldError } from './types'

/**
 * Error normalizado del backend.
 *
 * Todas las peticiones pasan por `client.ts`, que convierte cualquier
 * respuesta fallida en esta clase. La interfaz de usuario solo necesita
 * mirar `message` y `fieldErrors`; nunca parsea el JSON a mano.
 */
export class ApiError extends Error {
  readonly status: number
  /** Ruta que fallo, util para depurar con el `traceId` del servidor. */
  readonly path: string
  /**
   * Codigo estable del backend (`MANDATO_EXPIRADO`, `CONTACTO_NO_ENCONTRADO`...).
   * Es lo que se usa para DECIDIR; el `message` ya viene en espanol para
   * MOSTRAR. Ver `components/domain.tsx`.
   */
  readonly code: string
  /** Identificador de la traza en el servidor, para buscar logs. */
  readonly traceId: string | null
  /** Errores por campo, cuando el backend valida con `@Valid`. */
  readonly fieldErrors: Record<string, string>
  /** Cuerpo crudo, por si hay que depurar. */
  readonly body: unknown

  constructor(status: number, path: string, body: unknown, fallback?: string) {
    const parsed = parseBody(body)
    super(parsed?.message || fallback || `Error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.body = body
    this.code = parsed?.code ?? ''
    this.traceId = parsed?.traceId ?? null
    this.fieldErrors = toFieldMap(parsed?.details)
  }

  /** 400: el backend rechazo la peticion (validacion o regla de negocio). */
  get isBadRequest(): boolean {
    return this.status === 400
  }

  /**
   * 401: falta `X-User-Id` o el usuario no existe. Es el unico caso en el
   * que la sesion se puede recuperar volver a arrancar el onboarding.
   */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 404: el recurso no existe o es de otro usuario. */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** 409: conflicto de estado (mandato ya revocado, pago ya confirmado...). */
  get isConflict(): boolean {
    return this.status === 409
  }

  /** 5xx: fallo del servidor. Vale la pena reintentar. */
  get isServer(): boolean {
    return this.status >= 500
  }

  /**
   * Mensaje listo para mostrar. Si hay errores de campo, los lista:
   * asi el usuario sabe que campo corregir sin leer la consola.
   */
  get displayMessage(): string {
    const campos = Object.entries(this.fieldErrors)
    if (campos.length === 0) return this.message
    return campos.map(([campo, texto]) => `${campo}: ${texto}`).join(' · ')
  }
}

/**
 * Convierte el `details` del backend en un mapa `campo -> mensaje`.
 *
 * El backend devuelve `List<FieldErrorDetail>`, y con Bean Validation el
 * campo viene con el prefijo del record (`contactRequest.name`), asi que se
 * recorta el prefijo: el formulario ya sabe en que campo esta el error.
 */
function toFieldMap(details: FieldError[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of details ?? []) {
    if (!d?.field) continue
    const campo = d.field.split('.').pop() ?? d.field
    out[campo] = d.message
  }
  return out
}

/**
 * Filtra el cuerpo de error de Nexora.
 *
 * El unico formato valido es `ErrorResponse` (record del backend). Se tolera
 * que venga otra cosa (un 502 de un proxy, por ejemplo) sin romper.
 */
function parseBody(body: unknown): ApiErrorBody | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Partial<ApiErrorBody> & { error?: unknown }
  const mensaje = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : null
  if (!mensaje) return null
  return {
    timestamp: b.timestamp ?? new Date().toISOString(),
    status: b.status ?? 0,
    code: typeof b.code === 'string' ? b.code : '',
    message: mensaje,
    path: b.path ?? '',
    details: Array.isArray(b.details) ? (b.details as FieldError[]) : null,
    traceId: typeof b.traceId === 'string' ? b.traceId : null,
  }
}

/** Error de red: el backend no respondio (Caido, DNS, CORS, timeout). */
export class NetworkError extends Error {
  readonly path: string

  constructor(path: string, cause?: unknown) {
    const motivo = cause instanceof Error ? cause.message : String(cause ?? '')
    super(
      `No se pudo contactar al servidor${motivo ? ` (${motivo})` : ''}. ` +
        'Revisa que el backend este levantado y que VITE_API_URL sea correcto.',
    )
    this.name = 'NetworkError'
    this.path = path
  }
}
