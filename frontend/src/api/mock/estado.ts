/**
 * Estado en memoria del backend simulado.
 *
 * Reproduce lo que hace `com.nexora` para que el panel se pueda
 * probar sin PostgreSQL ni servicios externos. La regla que mas importa:
 *
 *   TODOS los ids se guardan y se comparan como UUID CRUDOS.
 *
 * (En la version anterior del proyecto los seeds guardaban ids como
 * `user-ana` y el codigo los comparaba contra un `uuid()` con prefijo. El
 * `.find()` devolvia `undefined` y el panel entero se caia al renderizar.
 * Aqui no existe ningun formato mixes: `uuid()` genera y `uuid()` compara.)
 *
 * Ademas, las reglas se evaluan de verdad: si el usuario escribe un pago que
 * supera el tope diario, el mock lo RECHAZA. Un mock que siempre deja pasar
 * teaches a usar una pantalla que nunca muestra el caso que importa.
 */

import type {
  Account,
  Alert,
  Approval,
  AuditActor,
  AuditEvent,
  AuditEventType,
  ChatMessage,
  Contact,
  Mandate,
  Proposal,
  User,
} from '../types'

/* ------------------------------------------------------------------ */
/* Generadores                                                        */
/* ------------------------------------------------------------------ */

/**
 * UUID v4 real. Se usa el nativo si existe; el fallback mantiene el formato
 * para que nada se rompa en navegadores viejos.
 */
export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Direccion Stellar plausible con el formato que exige el backend.
 *
 * El mock no habla con la red, pero si valida el formato, porque es lo que
 * el usuario ve cuando pega una direccion: si el panel aceptara cualquier
 * texto, el error se descubriria en el servidor y no aqui.
 */
export function direccion(prefijo: 'G' | 'C' = 'G'): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let cuerpo = ''
  for (let i = 0; i < 55; i++) {
    cuerpo += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return prefijo + cuerpo
}

/** Hash de transaccion de 64 hex, como exige `^[0-9a-fA-F]{64}$`. */
export function hashTx(): string {
  let out = ''
  const hex = '0123456789abcdef'
  for (let i = 0; i < 64; i++) out += hex[Math.floor(Math.random() * 16)]
  return out
}

/** Clave publica de 64 hex. */
export function claveHex(): string {
  return hashTx()
}

/** Instant en ISO, que es como viaja por JSON. */
export function ahora(): string {
  return new Date().toISOString()
}

export function enMinutos(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString()
}

export function enHoras(horas: number): string {
  return enMinutos(horas * 60)
}

export function enDias(dias: number): string {
  return enHoras(dias * 24)
}

/* ------------------------------------------------------------------ */
/* Dinero                                                            */
/* ------------------------------------------------------------------ */

/**
 * Formatea a 7 decimales, que es lo que produce `Money.format` en el
 * backend. Se hace en string para no arrastrar errores de coma flotante
 * a las comparaciones de topes.
 */
export function formatoMonto(valor: number): string {
  // `Number.NaN.toFixed` no lanza, pero `undefined.toFixed` sí, y un
  // movimiento sin importe se arrastraba hasta aquí. Se protege la firma.
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '0.0000000'
  return valor.toFixed(7)
}

/** Redondea a 7 decimales, igual que `Money` del backend. */
export function redondear(valor: number): number {
  return Math.round(valor * 1e7) / 1e7
}

/* ------------------------------------------------------------------ */
/* Estado global                                                      */
/* ------------------------------------------------------------------ */

/** Instante en el que arranco el mock: las ventanas de 24 h cuentan desde aqui. */
export const ARRANQUE = Date.now()

/**
 * Tope on-chain que aplica el firmante simulado: 50 USDC en 24 h por smart
 * account, con codigo de contrato 3221 (`SpendingLimitExceeded`).
 *
 * Es importante que exista: sin el, el ataque "llave robada" siempre pasaria
 * y la demo de alertas no tendria nada que demostrar. El README explica que
 * con 60 USDC la red lo bloquea.
 */
export const TOPE_ONCHAIN_24H = 50

export interface Estado {
  usuario: User | null
  cuenta: Account | null
  /** Version vigente de la llave del agente. Sube al revocar. */
  versionLlave: number
  claveAgenteHex: string

  contactos: Contact[]
  mandatos: Mandate[]
  /** El backend guarda la conversacion de cada mensaje aunque no la devuelva en la lista. */
  mensajes: (ChatMessage & { conversationId?: string })[]
  propuestas: Proposal[]
  aprobaciones: Approval[]
  alertas: Alert[]
  auditoria: AuditEvent[]

  /** Transferencias USDC que salieron de la cuenta en las ultimas 24 h. */
  gastadoOnchain24h: number
  /** Transferencias USDC imputadas a propuestas del chat, por hash. */
  pagosDelChat: Set<string>
  /** Cifras de Alertas ya generadas, para no duplicar por transaccion. */
  alertasPorTx: Set<string>
  /** Instantes de las propuestas, para la regla de frecuencia. */
  propuestasRecientes: number[]
  /** Instantes de los mensajes, para el limite del chat. */
  mensajesPorMinuto: number[]

  /** Ledger simulado. */
  ledger: number
}

export const estado: Estado = {
  usuario: null,
  cuenta: null,
  versionLlave: 1,
  claveAgenteHex: claveHex(),
  contactos: [],
  mandatos: [],
  mensajes: [],
  propuestas: [],
  aprobaciones: [],
  alertas: [],
  auditoria: [],
  gastadoOnchain24h: 0,
  pagosDelChat: new Set(),
  alertasPorTx: new Set(),
  propuestasRecientes: [],
  mensajesPorMinuto: [],
  ledger: 1_000_000,
}

/** Devuelve el mock al estado inicial. Lo usa el boton "reiniciar demo". */
export function reiniciar(): void {
  estado.usuario = null
  estado.cuenta = null
  estado.versionLlave = 1
  estado.claveAgenteHex = claveHex()
  estado.contactos = []
  estado.mandatos = []
  estado.mensajes = []
  estado.propuestas = []
  estado.aprobaciones = []
  estado.alertas = []
  estado.auditoria = []
  estado.gastadoOnchain24h = 0
  estado.pagosDelChat = new Set()
  estado.alertasPorTx = new Set()
  estado.propuestasRecientes = []
  estado.mensajesPorMinuto = []
  estado.ledger = 1_000_000
}

/* ------------------------------------------------------------------ */
/* Consultas                                                          */
/* ------------------------------------------------------------------ */

export function mandatoActivo(): Mandate | null {
  const ahoraMs = Date.now()
  for (const m of estado.mandatos) {
    if (m.status === 'ACTIVO' && new Date(m.expiresAt).getTime() > ahoraMs) return m
  }
  return null
}

export function propuestaPorId(id: string): Proposal | undefined {
  return estado.propuestas.find((p) => p.id === id)
}

export function aprobacionPorId(id: string): Approval | undefined {
  return estado.aprobaciones.find((a) => a.id === id)
}

export function alertaPorId(id: string): Alert | undefined {
  return estado.alertas.find((a) => a.id === id)
}

export function contactoPorNombre(nombre: string): Contact | undefined {
  const objetivo = normalizar(nombre)
  return estado.contactos.find((c) => normalizar(c.name) === objetivo)
}

/** Sin acentos y en mayusculas, como `TextNormalizer` del backend. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

/* ------------------------------------------------------------------ */
/* Auditoria                                                          */
/* ------------------------------------------------------------------ */

/**
 * Anota un evento en la auditoria. El backend registra los mismos tipos con
 * `AuditService`, y la pagina de auditoria los muestra tal cual llegan.
 */
export function auditar(
  eventType: AuditEventType,
  actor: AuditActor,
  resumen: string,
  extra: { proposalId?: string | null; mandateId?: string | null; data?: Record<string, unknown> } = {},
): void {
  estado.auditoria.push({
    id: uuid(),
    occurredAt: ahora(),
    eventType,
    actor,
    proposalId: extra.proposalId ?? null,
    mandateId: extra.mandateId ?? null,
    summary: resumen,
    data: extra.data ?? null,
  })
}

/* ------------------------------------------------------------------ */
/* Alertas                                                            */
/* ------------------------------------------------------------------ */

/**
 * Genera la alerta de "movimiento no reconocido" si la transferencia no
 * corresponde a una propuesta del chat. Es el `ReconciliationJob` del
 * backend, aqui ejecutado al vuelo en vez de cada 60 s.
 */
export function conciliar(txHash: string, destino: string, monto: number): Alert | null {
  if (estado.alertasPorTx.has(txHash)) return null
  if (estado.pagosDelChat.has(txHash)) return null

  estado.alertasPorTx.add(txHash)
  estado.ledger += 1

  const importe = formatoMonto(monto)

  const alerta: Alert = {
    id: uuid(),
    status: 'PENDIENTE',
    txHash,
    ledger: estado.ledger,
    destinationAddress: destino,
    amount: importe,
    asset: 'USDC',
    occurredAt: ahora(),
    detectedAt: ahora(),
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    mandateId: mandatoActivo()?.id ?? null,
    // El texto lo redacta el backend; el panel lo muestra tal cual. Usa el
    // MISMO importe que el campo `amount`: si el mensaje dijera "77" y el
    // campo "77.0000000", el usuario vería dos cifras distintas para el mismo
    // dinero.
    message: `Detectamos un pago de ${importe} USDC a ${cortar(destino)}. ¿Fuiste tú?`,
    decidedAt: null,
  }
  estado.alertas.unshift(alerta)
  auditar('MOVIMIENTO_NO_RECONOCIDO', 'RED', 'Movimiento no reconocido en la smart account', {
    mandateId: alerta.mandateId,
    data: { txHash, ledger: estado.ledger, destino, monto: formatoMonto(monto) },
  })
  return alerta
}

/** `GABC…WXYZ` */
export function cortar(direccionTexto: string | null): string | null {
  if (!direccionTexto || direccionTexto.length <= 12) return direccionTexto
  return `${direccionTexto.slice(0, 5)}.${direccionTexto.slice(-5)}`
}

/* ------------------------------------------------------------------ */
/* Reexportes de tipos                                                */
/* ------------------------------------------------------------------ */

export type {
  Account,
  Alert,
  Approval,
  AuditActor,
  AuditEvent,
  AuditEventType,
  ChatMessage,
  Contact,
  Mandate,
  Proposal,
  User,
}
