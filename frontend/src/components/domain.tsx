/**
 * Vocabulario visual del dominio Nexora.
 *
 * Aqui es donde los enums del backend se convierten en palabras e iconos.
 * Las paginas NO deben inventar etiquetas: si un estado nuevo aparece en Java,
 * se anade aqui y todas las pantallas lo muestran igual y con el mismo color.
 *
 * La regla de color es la misma que en el resto del sistema: el tono va
 * SIEMPRE acompanado de texto. Un usuario con daltonismo tiene que poder
 * distinguir "esperando tu confirmacion" de "rechazado" sin depender del
 * color, y por eso cada insignia lleva su palabra.
 */

import type { ReactNode } from 'react'

import { Badge, type BadgeTone } from './ui'
import {
  IconAlerta,
  IconAprobaciones,
  IconCheck,
  IconError,
  IconInfo,
  IconReloj,
} from './icons'
import type {
  AlertStatus,
  ApprovalStatus,
  AuditActor,
  AuditEventType,
  Limits,
  MandateStatus,
  Proposal,
  ProposalStatus,
  RejectionCode,
} from '@/api/types'
import { compararImportes, formatAmount, porcentaje, restarImportes } from '@/lib/format'

/* ================================================================== */
/* Estados de propuesta                                               */
/* ================================================================== */

const PROPUESTA: Record<ProposalStatus, { texto: string; tono: BadgeTone; led?: 'pulsando' | 'encendido' }> = {
  PROPUESTO: { texto: 'Interpretada', tono: 'neutro' },
  RECHAZADO: { texto: 'Rechazada', tono: 'error' },
  PENDIENTE_APROBACION: { texto: 'Esperando tu OK', tono: 'aviso', led: 'pulsando' },
  APROBADO: { texto: 'Aprobada', tono: 'acento' },
  ENVIADO: { texto: 'Enviando', tono: 'info', led: 'pulsando' },
  CONFIRMADO: { texto: 'Confirmada', tono: 'ok', led: 'encendido' },
  FALLIDO: { texto: 'Fallida', tono: 'error' },
}

export function ProposalStatusBadge({
  status,
  tamano,
}: {
  status: ProposalStatus
  tamano?: 'normal' | 'grande'
}) {
  const { texto, tono, led } = PROPUESTA[status] ?? { texto: status, tono: 'neutro' as BadgeTone }
  return (
    <Badge tone={tono} led={led} tamano={tamano ?? 'normal'}>
      {texto}
    </Badge>
  )
}

/* ================================================================== */
/* Estados de aprobacion                                              */
/* ================================================================== */

const APROBACION: Record<ApprovalStatus, { texto: string; tono: BadgeTone }> = {
  PENDIENTE: { texto: 'Esperando tu OK', tono: 'aviso' },
  APROBADA: { texto: 'Aprobada', tono: 'ok' },
  RECHAZADA: { texto: 'Rechazada', tono: 'error' },
  EXPIRADA: { texto: 'Vencida', tono: 'neutro' },
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const { texto, tono } = APROBACION[status] ?? { texto: status, tono: 'neutro' as BadgeTone }
  return <Badge tone={tono} led={status === 'PENDIENTE' ? 'pulsando' : undefined}>{texto}</Badge>
}

/* ================================================================== */
/* Estados de alerta                                                  */
/* ================================================================== */

const ALERTA: Record<AlertStatus, { texto: string; tono: BadgeTone }> = {
  // PENDIENTE es lo unico que exige accion: va en el color de alarma.
  PENDIENTE: { texto: 'Sin revisar', tono: 'error' },
  RECONOCIDA: { texto: 'Reconocida por ti', tono: 'neutro' },
  REPORTADA: { texto: 'Reportada', tono: 'oro' },
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const { texto, tono } = ALERTA[status] ?? { texto: status, tono: 'neutro' as BadgeTone }
  return <Badge tone={tono} led={status === 'PENDIENTE' ? 'pulsando' : undefined}>{texto}</Badge>
}

/* ================================================================== */
/* Estado del mandato                                                 */
/* ================================================================== */

const MANDATO: Record<MandateStatus, { texto: string; tono: BadgeTone }> = {
  ACTIVO: { texto: 'Activo', tono: 'ok' },
  REVOCADO: { texto: 'Revocado', tono: 'error' },
  EXPIRADO: { texto: 'Vencido', tono: 'neutro' },
}

export function MandateStatusBadge({ status }: { status: MandateStatus }) {
  const { texto, tono } = MANDATO[status] ?? { texto: status, tono: 'neutro' as BadgeTone }
  return <Badge tone={tono} led={status === 'ACTIVO' ? 'encendido' : undefined}>{texto}</Badge>
}

/* ================================================================== */
/* Motivos de rechazo                                                 */
/* ================================================================== */

/**
 * Version corta del motivo, para insignias y filtros. El texto largo lo
 * escribe el backend en `rejectionMessage` y ese es el que se muestra.
 */
const RECHAZO: Record<RejectionCode, string> = {
  ESQUEMA_INVALIDO: 'No entendido',
  ACTIVO_NO_PERMITIDO: 'Activo no permitido',
  CONFIANZA_BAJA: 'Confianza baja',
  CAMPO_NO_FUNDAMENTADO: 'Datos incompletos',
  CONTACTO_NO_ENCONTRADO: 'No es un contacto',
  CONTACTO_AMBIGUO: 'Contacto ambiguo',
  MONTO_NO_EN_TEXTO: 'Monto inventado',
  MONTO_AMBIGUO: 'Monto ambiguo',
  SIN_MANDATO_ACTIVO: 'Sin mandato',
  MANDATO_EXPIRADO: 'Mandato vencido',
  SUPERA_TOPE_TRANSACCION: 'Supera el tope por pago',
  SUPERA_TOPE_DIARIO: 'Supera el tope diario',
  LIMITE_FRECUENCIA: 'Demasiadas solicitudes',
  RECHAZADO_POR_USUARIO: 'Rechazada por ti',
  APROBACION_EXPIRADA: 'Aprobación vencida',
  MANDATO_REVOCADO: 'Mandato revocado',
}

/** Etiqueta corta del motivo, o el propio codigo si no esta en el mapa. */
export function rechazoLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return RECHAZO[code as RejectionCode] ?? code
}

/** Insignia con el motivo del rechazo. `null` si no hubo rechazo. */
export function RejectionBadge({ code }: { code: string | null | undefined }) {
  const etiqueta = rechazoLabel(code)
  if (!etiqueta) return null
  return <Badge tone="error">{etiqueta}</Badge>
}

/* ================================================================== */
/* Auditoria                                                          */
/* ================================================================== */

const EVENTO: Record<AuditEventType, string> = {
  USUARIO_CREADO: 'Usuario creado',
  CUENTA_REGISTRADA: 'Cuenta registrada',
  MANDATO_CREADO: 'Mandato creado',
  MANDATO_REVOCADO: 'Mandato revocado',
  CONTACTO_CREADO: 'Contacto añadido',
  CONTACTO_EDITADO: 'Contacto editado',
  CONTACTO_ARCHIVADO: 'Contacto archivado',
  CHAT_RECIBIDO: 'Mensaje recibido',
  IA_RESPUESTA: 'Respuesta de la IA',
  IA_ERROR: 'La IA falló',
  PROPUESTA_CREADA: 'Propuesta creada',
  VALIDACION_OK: 'Validación correcta',
  VALIDACION_RECHAZADA: 'Validación rechazada',
  APROBACION_SOLICITADA: 'Aprobación solicitada',
  APROBACION_APROBADA: 'Aprobación concedida',
  APROBACION_RECHAZADA: 'Aprobación rechazada',
  APROBACION_EXPIRADA: 'Aprobación vencida',
  FIRMA_SOLICITADA: 'Firma solicitada',
  TX_CONFIRMADA: 'Transacción confirmada',
  TX_FALLIDA: 'Transacción fallida',
  ATAQUE_DEMO: 'Intento sin agente',
  LLAVE_ROTADA: 'Llave rotada',
  MOVIMIENTO_NO_RECONOCIDO: 'Movimiento no reconocido',
  ALERTA_CONFIRMADA: 'Alerta confirmada',
  LLAVE_COMPROMETIDA: 'Llave comprometida',
}

export function eventoLabel(tipo: AuditEventType | string): string {
  return EVENTO[tipo as AuditEventType] ?? tipo
}

/** Quién actuó. Distinguir "lo hizo el usuario" de "lo hizo el sistema". */
const ACTOR: Record<AuditActor, { texto: string; tono: BadgeTone }> = {
  USUARIO: { texto: 'Tú', tono: 'acento' },
  IA: { texto: 'IA', tono: 'info' },
  BACKEND: { texto: 'Backend', tono: 'neutro' },
  FIRMANTE: { texto: 'Firmante', tono: 'neutro' },
  RED: { texto: 'Red', tono: 'oro' },
}

export function ActorBadge({ actor }: { actor: AuditActor }) {
  const { texto, tono } = ACTOR[actor] ?? { texto: actor, tono: 'neutro' as BadgeTone }
  return <Badge tone={tono}>{texto}</Badge>
}

/* ================================================================== */
/* Importe                                                           */
/* ================================================================== */

export interface MontoProps {
  /** String decimal del backend. Nunca se convierte a `number` para calcular. */
  amount: string | null | undefined
  asset?: string
  className?: string
  /** Versiones grandes y atenuadas para tablas densas. */
  compacto?: boolean
}

/**
 * Importe con su activo. El string del backend se pasa tal cual a `Intl`, que
 * es quien decide los separadores del locale.
 */
export function Monto({ amount, asset = 'USDC', className, compacto }: MontoProps) {
  if (amount === null || amount === undefined) {
    return <span className={className}>—</span>
  }
  return (
    <span className={className}>
      {formatAmount(amount, compacto ? undefined : asset)}
      {compacto && <span className="ml-1 text-tinta-media">{asset}</span>}
    </span>
  )
}

/* ================================================================== */
/* Barra de gasto del dia                                             */
/* ================================================================== */

export interface GastoBarProps {
  gastado: string
  diario: string
  /** Umbral a partir del cual se pide confirmacion. */
  umbral?: string | null
}

/**
 * Cuanto del tope diario se ha gastado.
 *
 * Se dibuja con la misma escala que el mandato para que el usuario pueda
 * leerla como "lo que autorizaste": el ancho total es el tope diario, y una
 * marca aparte indica el umbral de aprobacion automatica.
 */
export function GastoBar({ gastado, diario, umbral }: GastoBarProps) {
  // El ancho de la barra es una proporcion (puede ser `number`), pero lo que
  // lee el usuario se calcula en string: "te quedan 17.0000000", no
  // "16.999999999999998".
  const relleno = porcentaje(gastado, diario)
  const restante = restarImportes(diario, gastado)
  const sinNada = restante === '0.0000000'
  // Queda poco para el siguiente pago: el siguiente va a pedir confirmacion.
  const casiAgotado =
    umbral !== null && umbral !== undefined && !sinNada && compararImportes(restante, umbral) <= 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-tinta-media">Gastado en las últimas 24 h</span>
        <span className="cifras font-medium">
          {formatAmount(gastado)} <span className="text-tinta-media">de {formatAmount(diario)}</span>
        </span>
      </div>

      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-superficie-2"
        role="img"
        aria-label={`Gastado ${formatAmount(gastado)} de ${formatAmount(diario)} USDC en las últimas 24 horas`}
      >
        <div
          className={`h-full rounded-full ${casiAgotado ? 'bg-error' : 'bg-acento'}`}
          style={{ width: `${relleno}%` }}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-2xs text-tinta-media">
        <span>
          Te quedan <span className="cifras font-medium text-tinta">{formatAmount(restante)}</span>
        </span>
        {umbral !== null && umbral !== undefined && (
          <span>
            Pide tu OK a partir de <span className="cifras">{formatAmount(umbral)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/* Las 8 reglas de validacion                                         */
/* ================================================================== */

/**
 * Las ocho reglas del backend, en el orden en que se aplican.
 *
 * Se muestran como una lista de estados: verde las que pasaron, rojo la que
 * fallo. Es la forma mas clara de explicar POR QUE un pago no salio, sin
 * pedirle al usuario que entienda el texto del rechazo.
 */
const REGLAS = [
  { clave: 'ESQUEMA', texto: 'Solo USDC y los campos permitidos' },
  { clave: 'CONFIANZA', texto: 'La IA está segura de lo que entendió' },
  { clave: 'CONTACTO', texto: 'El destinatario es uno de tus contactos' },
  { clave: 'MONTO_EN_TEXTO', texto: 'El monto aparece escrito en tu mensaje' },
  { clave: 'MANDATO', texto: 'Tienes un mandato vigente' },
  { clave: 'TOPE_TRANSACCION', texto: 'No supera el tope por pago' },
  { clave: 'TOPE_DIARIO', texto: 'Queda dentro del tope de 24 h' },
  { clave: 'FRECUENCIA', texto: 'No has pedido demasiados pagos' },
] as const

/** De que regla habla cada codigo de rechazo del backend. */
const REGLA_DEL_CODIGO: Record<string, string> = {
  ESQUEMA_INVALIDO: 'ESQUEMA',
  CONFIANZA_BAJA: 'CONFIANZA',
  ACTIVO_NO_PERMITIDO: 'ESQUEMA',
  CAMPO_NO_PERMITIDO: 'ESQUEMA',
  CONTACTO_NO_ENCONTRADO: 'CONTACTO',
  CONTACTO_AMBIGUO: 'CONTACTO',
  MONTO_NO_EN_TEXTO: 'MONTO_EN_TEXTO',
  MONTO_FUERA_DE_RANGO: 'MONTO_EN_TEXTO',
  SIN_MANDATO_ACTIVO: 'MANDATO',
  MANDATO_EXPIRADO: 'MANDATO',
  MANDATO_REVOCADO: 'MANDATO',
  CLAVE_FIRMANTE_INVALIDA: 'MANDATO',
  SUPERA_TOPE_TRANSACCION: 'TOPE_TRANSACCION',
  SUPERA_TOPE_DIARIO: 'TOPE_DIARIO',
  TOPE_ONCHAIN: 'TOPE_DIARIO',
  APROBACION_EXPIRADA: 'FRECUENCIA',
  DEMASIADAS_PROPUESTAS: 'FRECUENCIA',
}

export type EstadoRegla = 'paso' | 'falla' | 'no-comprobable'

/**
 * Que reglas se pueden comprobar desde el panel.
 *
 * El backend NO envia la lista de reglas evaluadas: `ProposalResponse` solo
 * trae `rejectionCode` y `rejectionMessage`. Asi que el panel deduce lo que
 * puede con los datos que ya tiene (el activo, el contacto, el mandato y los
 * topes) y deja en blanco las reglas que dependen de la IA o de la
 * frecuencia, que solo el servidor puede saber. Ponerlas en rojo seria
 * mentir: no fallaron, es que aqui no se pueden ver.
 *
 * Cuando hay `rejectionCode`, esa regla se marca como fallida aunque el panel
 * no la pueda calcular: el backend ya ha dicho que fallo ahi.
 */
export function evaluarReglas(propuesta: Proposal, limits: Limits | null | undefined): EstadoRegla[] {
  const fallida = propuesta.rejectionCode ? REGLA_DEL_CODIGO[propuesta.rejectionCode] : undefined
  const importe = propuesta.amount

  const chequeo: Record<string, () => EstadoRegla> = {
    ESQUEMA: () => (propuesta.asset === 'USDC' ? 'paso' : 'falla'),
    CONFIANZA: () => 'no-comprobable',
    CONTACTO: () => (propuesta.contactId ? 'paso' : 'falla'),
    MONTO_EN_TEXTO: () => 'no-comprobable',
    MANDATO: () => (propuesta.mandateId ? 'paso' : 'falla'),
    TOPE_TRANSACCION: () => {
      if (!limits || importe === null) return 'no-comprobable'
      return compararImportes(importe, limits.perTxLimit) <= 0 ? 'paso' : 'falla'
    },
    TOPE_DIARIO: () => {
      if (!limits || importe === null) return 'no-comprobable'
      return compararImportes(importe, limits.availableLast24h) <= 0 ? 'paso' : 'falla'
    },
    FRECUENCIA: () => 'no-comprobable',
  }

  return REGLAS.map((r) => {
    if (fallida === r.clave) return 'falla'
    if (fallida) {
      // Las reglas anteriores a la que fallo si se llegaron a comprobar.
      return REGLAS.findIndex((x) => x.clave === fallida) > REGLAS.indexOf(r) ? 'no-comprobable' : chequeo[r.clave]()
    }
    return chequeo[r.clave]()
  })
}

export function ReglasAplicadas({
  propuesta,
  limits,
}: {
  propuesta: Proposal
  limits?: Limits | null
}) {
  const estados = evaluarReglas(propuesta, limits)
  if (estados.every((e) => e === 'no-comprobable')) return null

  return (
    <ul className="m-0 grid list-none gap-1 p-0">
      {REGLAS.map((regla, i) => {
        const estado = estados[i]
        return (
          <li key={regla.clave} className="flex items-start gap-1.5 text-xs">
            {estado === 'paso' ? (
              <IconCheck className="mt-px h-3.5 w-3.5 shrink-0 text-ok" />
            ) : estado === 'falla' ? (
              <IconError className="mt-px h-3.5 w-3.5 shrink-0 text-error" />
            ) : (
              <span
                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-linea-fuerte"
                aria-hidden="true"
              />
            )}
            <span className={estado === 'paso' ? 'text-tinta' : 'text-tinta-media'}>
              {regla.texto}
              {estado === 'no-comprobable' && (
                <span className="text-tinta-media/70"> (lo comprueba el backend)</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/* ================================================================== */
/* Aviso de ambiente simulado                                         */
/* ================================================================== */

export type ModoBackend = 'mock' | 'http'

/**
 * Aviso de que la IA o el firmante estan simulados.
 *
 * Es informacion critica, no decorativa: si el firmante es `mock` no hay
 * ninguna clave privada en juego y el usuario tiene que saberlo antes de
 * confiar en lo que ve. Por eso va arriba, con color de aviso, no en un pie.
 */
export function AvisoSimulado({ aiMode, signerMode }: { aiMode?: string; signerMode?: string }) {
  const simulado = aiMode === 'mock' || signerMode === 'mock'
  if (!simulado) return null

  const partes = [
    aiMode === 'mock' ? 'la IA' : null,
    signerMode === 'mock' ? 'el firmante' : null,
  ].filter(Boolean)

  return (
    <p className="flex items-start gap-1.5 rounded-control border border-aviso/30 bg-aviso-50 px-2.5 py-1.5 text-xs text-aviso">
      <IconInfo className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Simulado: {partes.join(' y ')}. No hay claves privadas ni pagos reales. Solo testnet.
      </span>
    </p>
  )
}

/* ================================================================== */
/* Bloque de rechazo                                                  */
/* ================================================================== */

/**
 * Explica un rechazo: el motivo corto, el texto largo del backend y, si la
 * regla lo dice, que hacer paraolver a intentarlo.
 */
export function BloqueRechazo({
  code,
  message,
  accion,
}: {
  code: string | null | undefined
  message: string | null | undefined
  /** Que puede hacer el usuario para desbloquearlo. */
  accion?: ReactNode
}) {
  const etiqueta = rechazoLabel(code)
  if (!etiqueta && !message) return null

  return (
    <div className="rounded-control border border-error/25 bg-error-50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
        <IconAlerta className="h-3.5 w-3.5 shrink-0" />
        {etiqueta ?? 'Rechazado'}
      </p>
      {message && <p className="mt-1 text-xs text-tinta">{message}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

/* ================================================================== */
/* Datos en vivo                                                     */
/* ================================================================== */

const ICONO_ESTADO: Record<ApprovalStatus, typeof IconAprobaciones> = {
  PENDIENTE: IconReloj,
  APROBADA: IconAprobaciones,
  RECHAZADA: IconError,
  EXPIRADA: IconReloj,
}

/** Icono asociado a un estado de aprobacion, para las cabeceras. */
export function IconoAprobacion({ status }: { status: ApprovalStatus }) {
  const Ico = ICONO_ESTADO[status] ?? IconInfo
  return <Ico className="h-4 w-4" />
}
