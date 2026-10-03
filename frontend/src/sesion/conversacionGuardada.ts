/**
 * Conversacion abierta, en sessionStorage por usuario: sobrevive a cambiar de
 * pantalla y a recargar, pero no a iniciar o cerrar sesion. Cada sesion
 * empieza con un chat nuevo; las anteriores quedan en el historial lateral.
 */

const PREFIJO = 'nexora.conversacion.'

export function leerConversacion(userId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIJO + userId)
  } catch {
    return null
  }
}

export function guardarConversacion(userId: string, conversationId: string | null): void {
  try {
    if (conversationId) sessionStorage.setItem(PREFIJO + userId, conversationId)
    else sessionStorage.removeItem(PREFIJO + userId)
  } catch {
    /* sin almacenamiento: dura lo que dura la pantalla */
  }
}

export function olvidarConversaciones(): void {
  try {
    for (const clave of Object.keys(sessionStorage)) {
      if (clave.startsWith(PREFIJO)) sessionStorage.removeItem(clave)
    }
  } catch {
    /* sin almacenamiento */
  }
}
