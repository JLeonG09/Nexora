/**
 * Tarjeta de propuesta de pago.
 *
 * Es la pieza mas importante del panel: es donde el usuario ve, en una sola
 * pantalla y con su propio lenguaje, "a quién, cuánto, por qué y qué va a
 * pasar ahora". El chat, el historial y la lista de propuestas la reutilizan
 * para que un mismo pago se vea igual en todas partes.
 *
 * Dos reglas de diseño que no son estéticas:
 *
 *  1. El estado va SIEMPRE con su consecuencia escrita al lado. No basta con
 *     un color: "EN ESPERA" sin decir "esperando tu OK" deja al usuario
 *     pensando que el pago ya salió.
 *  2. Nunca se enseña un identificador técnico como si fuera información
 *     útil. El hash va en un enlace ("ver en el explorador"), no en el medio
 *     del texto; la regla que seincumplió sí se explica en humano.
 */

import type { ReactNode } from 'react'

import { Badge, Button, StellarAddress } from './ui'
import { IconCheck, IconCopiar, IconError, IconExterno, IconOjo } from './icons'
import {
  BloqueRechazo,
  Monto,
  ProposalStatusBadge,
  ReglasAplicadas,
} from './domain'
import { useCopy } from '@/hooks'
import { formatDateTime, formatRelative } from '@/lib/format'
import { explorerTx } from '@/lib/stellar'
import type { Limits, Proposal, SimulatedTransfer } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Enlace al explorador                                               */
/* ------------------------------------------------------------------ */

/** Enlace a la transaccion en Stellar Expert. */
export function EnlaceTx({
  txHash,
  explorerUrl,
  texto = 'Ver en el explorador',
}: {
  txHash: string | null | undefined
  explorerUrl?: string | null
  texto?: string
}) {
  if (!txHash) return null
  const href = explorerUrl ?? explorerTx(txHash)
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-2xs font-medium text-acento underline underline-offset-2 hover:no-underline"
    >
      {texto}
      <IconExterno className="h-3 w-3" />
    </a>
  )
}

/* ------------------------------------------------------------------ */
/* Copiar un hash                                                     */
/* ------------------------------------------------------------------ */

function CopiarHash({ hash }: { hash: string }) {
  const { copiado, copiar } = useCopy(hash)
  return (
    <button
      type="button"
      onClick={() => void copiar()}
      className="inline-flex items-center gap-1 font-mono text-2xs text-tinta-media hover:text-tinta"
      title="Copiar hash"
    >
      {hash.slice(0, 10)}…{hash.slice(-6)}
      {copiado ? <IconCheck className="h-3 w-3 text-ok" /> : <IconCopiar className="h-3 w-3" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Transferencia simulada                                              */
/* ------------------------------------------------------------------ */

function FilaCuenta({
  titulo,
  direccion,
  antes,
  despues,
  asset,
  entra,
}: {
  titulo: string
  direccion: string | null
  antes: string
  despues: string
  asset: string
  entra: boolean
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-tinta">{titulo}</span>
        {direccion && (
          <StellarAddress publicKey={direccion} enlazar={false} className="text-2xs text-tinta-media" />
        )}
      </span>
      <span className="cifras flex items-center gap-1.5 text-xs">
        <Monto amount={antes} asset={asset} className="text-tinta-media line-through decoration-tinta-media/50" />
        <span aria-hidden="true" className="text-tinta-media">→</span>
        <span className="sr-only">pasa a</span>
        <Monto amount={despues} asset={asset} className={`font-semibold ${entra ? 'text-ok' : 'text-tinta'}`} />
      </span>
    </li>
  )
}

/** Con el firmante simulado no hay transacción real: se enseñan los saldos ficticios de ambas cuentas. */
function TransferenciaSimulada({ transferencia }: { transferencia: SimulatedTransfer }) {
  return (
    <section className="mt-2.5 rounded-control border border-linea bg-superficie-2 p-2" aria-label="Transferencia simulada">
      <p className="mb-1.5 flex items-center justify-between gap-2 text-2xs text-tinta-media">
        <span className="font-medium uppercase tracking-wide">Transferencia simulada</span>
        <Badge tone="neutro">Demo</Badge>
      </p>
      <ul className="space-y-1.5">
        <FilaCuenta
          titulo="Tu cuenta"
          direccion={transferencia.fromAddress}
          antes={transferencia.fromBefore}
          despues={transferencia.fromAfter}
          asset={transferencia.asset}
          entra={false}
        />
        <FilaCuenta
          titulo={`Cuenta de ${transferencia.toName ?? 'destino'}`}
          direccion={transferencia.toAddress}
          antes={transferencia.toBefore}
          despues={transferencia.toAfter}
          asset={transferencia.asset}
          entra
        />
      </ul>
      <p className="mt-1.5 text-2xs text-tinta-media">
        Saldos ficticios: tu cuenta empezó con 100 y cada contacto con 0. No hay transacción en Stellar.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Que va a pasar ahora                                                */
/* ------------------------------------------------------------------ */

/**
 * Traduce el estado a la siguiente accion concreta.
 *
 * Es el texto que evita la pregunta más frecuente de un producto de pagos
 * automatizados: "¿ya se pagó o todavía no?".
 */
function siguientePaso(estado: Proposal['status']): { texto: string; tono: 'neutro' | 'info' | 'aviso' | 'ok' } {
  switch (estado) {
    case 'PROPUESTO':
      return { texto: 'Se ha entendido tu mensaje. Nada sale todavía.', tono: 'neutro' }
    case 'PENDIENTE_APROBACION':
      return {
        texto: 'Supera tu umbral: está esperando que lo apruebes en Aprobaciones.',
        tono: 'aviso',
      }
    case 'APROBADO':
      return { texto: 'Lo has aprobado. El agente está firmando.', tono: 'info' }
    case 'ENVIADO':
      return { texto: 'Firmado y en la red. Falta que Stellar lo confirme.', tono: 'info' }
    case 'CONFIRMADO':
      return { texto: 'Confirmado en la red. El dinero ya salió.', tono: 'ok' }
    case 'FALLIDO':
      return { texto: 'La transacción ha fallado. No se ha movido dinero.', tono: 'neutro' }
    case 'RECHAZADO':
      return { texto: 'No se ha hecho nada. Puedes corregirlo y reintentarlo.', tono: 'neutro' }
    default:
      return { texto: '', tono: 'neutro' }
  }
}

/* ------------------------------------------------------------------ */
/* Tarjeta                                                            */
/* ------------------------------------------------------------------ */

export interface TarjetaPropuestaProps {
  propuesta: Proposal
  /** Muestra menos detalle: para listas densas. */
  compacta?: boolean
  /** Texto original del usuario, si se quiere mostrar. */
  mostrarOriginal?: boolean
  /** Boton a la derecha del pie: "Aprobar y ver". */
  onAprobar?: () => void
  /** Topes vigentes, para poder explicar las comprobaciones de limite. */
  limits?: Limits | null
  /** Acciones extra. */
  children?: ReactNode
}

export function TarjetaPropuesta({
  propuesta,
  compacta = false,
  mostrarOriginal = true,
  onAprobar,
  limits,
  children,
}: TarjetaPropuestaProps) {
  const paso = siguientePaso(propuesta.status)
  const rechazada = propuesta.status === 'RECHAZADO'

  return (
    <article
      className={`rounded-control border bg-superficie-1 ${
        rechazada ? 'border-error/30' : 'border-linea'
      } ${compacta ? 'p-2.5' : 'p-3'}`}
      aria-label={`Propuesta de pago a ${propuesta.contactName ?? 'destinatario desconocido'}`}
    >
      {/* --- Cabecera: importe y estado ------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className={`font-semibold tabular-nums text-tinta ${compacta ? 'text-sm' : 'text-base'}`}>
            <Monto amount={propuesta.amount} asset={propuesta.asset} />
          </p>
          <p className="mt-0.5 truncate text-xs text-tinta-media">
            {propuesta.contactName ? (
              <>
                para <span className="font-medium text-tinta">{propuesta.contactName}</span>
              </>
            ) : (
              'sin destinatario identificado'
            )}
          </p>
        </div>

        <ProposalStatusBadge status={propuesta.status} />
      </header>

      {/* --- Qué va a pasar ahora ------------------------------------ */}
      {paso.texto && (
        <p
          className={`mt-2 text-2xs ${
            paso.tono === 'aviso'
              ? 'font-medium text-aviso'
              : paso.tono === 'ok'
                ? 'font-medium text-ok'
                : 'text-tinta-media'
          }`}
        >
          {paso.texto}
        </p>
      )}

      {/* --- El mensaje del usuario ---------------------------------- */}
      {mostrarOriginal && propuesta.originalText && (
        <blockquote className="mt-2 border-l-2 border-linea pl-2 text-2xs italic text-tinta-media">
          «{propuesta.originalText}»
        </blockquote>
      )}

      {/* --- Datos técnicos, solo si existen ------------------------- */}
      {!compacta && propuesta.destinationAddress && (
        <div className="mt-2">
          <StellarAddress publicKey={propuesta.destinationAddress} etiqueta="Envía a" />
        </div>
      )}

      {propuesta.simulatedTransfer ? (
        <TransferenciaSimulada transferencia={propuesta.simulatedTransfer} />
      ) : (
        propuesta.txHash && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <EnlaceTx txHash={propuesta.txHash} explorerUrl={propuesta.explorerUrl} />
            <CopiarHash hash={propuesta.txHash} />
          </div>
        )
      )}

      {/* --- Por que no salio --------------------------------------- */}
      {rechazada && (
        <div className="mt-2.5">
          <BloqueRechazo code={propuesta.rejectionCode} message={propuesta.rejectionMessage} />
        </div>
      )}

      {/* --- Las 8 comprobaciones ------------------------------------ */}
      {!compacta && (
        <details className="mt-2.5">
          <summary className="cursor-pointer text-2xs text-tinta-media hover:text-tinta">
            Ver las 8 comprobaciones
          </summary>
          <div className="mt-1.5 rounded-control bg-superficie-2 p-2">
            <ReglasAplicadas propuesta={propuesta} limits={limits} />
          </div>
        </details>
      )}

      {/* --- Confianza de la IA ------------------------------------- */}
      {!compacta && propuesta.aiConfidence !== null && propuesta.aiConfidence !== undefined && (
        <p className="mt-2 text-2xs text-tinta-media">
          Confianza de la IA:{' '}
          <span className="cifras">{Math.round(propuesta.aiConfidence * 100)} %</span>
          {propuesta.aiConfidence < 0.7 && (
            <span className="ml-1 text-aviso">(por debajo del mínimo)</span>
          )}
        </p>
      )}

      {/* --- Pie: fecha y acciones ---------------------------------- */}
      <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-2">
        <time
          dateTime={propuesta.createdAt}
          title={formatDateTime(propuesta.createdAt)}
          className="text-2xs text-tinta-media"
        >
          {formatRelative(propuesta.createdAt)}
        </time>
        {children ?? (onAprobar && (
          <Button variante="primario" tamano="sm" onClick={onAprobar}>
            Ver y aprobar
          </Button>
        ))}
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Marcadores internos                                                 */
/* ------------------------------------------------------------------ */

/**
 * El backend guarda los `#ia-...` y `#firmante-...` en campos propios y
 * limpia el texto, pero si algo se cuela no debería aparecer en la burbuja:
 * son marcadores de la maquina, no texto para el usuario.
 */
export function limpiarMarcadores(texto: string): string {
  return texto
    .replace(/#ia-[a-z0-9-]+/gi, '')
    .replace(/#firmante-[a-z0-9-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* ------------------------------------------------------------------ */
/* Aviso de confianza baja                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuando la IA no esta segura, el backend rechaza el pago. Mostrar el aviso
 * en el chat evita el "no entiendo por que no paga" y, de paso, enseña que
 * el agente no se limita a obedecer.
 */
export function AvisoConfianza({ confianza }: { confianza: number | null | undefined }) {
  if (confianza === null || confianza === undefined || confianza >= 0.7) return null
  return (
    <p className="mt-1.5 flex items-start gap-1 text-2xs text-aviso">
      <IconError className="mt-px h-3 w-3 shrink-0" />
      <span>
        La IA solo estaba un {Math.round(confianza * 100)} % segura de lo que entendió, por
        debajo del 70 % que exige el sistema. No se paga por debajo de ese nivel: pregúntale con
        la cantidad y el destinatario explícitos.
      </span>
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Enlace interno                                                     */
/* ------------------------------------------------------------------ */

/** Boton discreto que lleva a otra pantalla pasando contexto. */
export function EnlaceInterno({
  onClick,
  children,
  etiqueta,
}: {
  onClick: () => void
  children: ReactNode
  etiqueta: string
}) {
  return (
    <Button variante="fantasma" tamano="sm" onClick={onClick} aria-label={etiqueta}>
      <IconOjo className="h-3.5 w-3.5" />
      {children}
    </Button>
  )
}

/** Etiqueta compacta de "aprobado por" para el historial. */
export function EtiquetaAprobador({ por }: { por: 'AUTOMATICO' | 'USUARIO' | null }) {
  if (!por) return null
  return (
    <Badge tone={por === 'USUARIO' ? 'acento' : 'neutro'}>
      {por === 'USUARIO' ? 'Lo aprobaste tú' : 'Aprobado por el agente'}
    </Badge>
  )
}
