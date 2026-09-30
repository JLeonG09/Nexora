/**
 * Bandeja de aprobaciones.
 *
 * Un pago llega aqui cuando supera el umbral del mandato: el agente lo
 * entendio bien y estan dentro de los topes, pero no tiene permiso para
 * firmarlo solo. Esta pantalla es, literalmente, el derecho a veto del
 * usuario sobre su dinero.
 *
 * Por eso la diseno no es "una lista con dos botones":
 *
 *  - Cada pago se muestra con el mensaje ORIGINAL del usuario, no solo con
 *    los campos que extrajo la IA. Aprobar "12 USDC a María" tiene que parecer
 *    lo mismo que aprobar "paga a María las cervezas de ayer".
 *  - Aprobar y rechazar exigen confirmacion, porque un clic de más en la fila
 *    equivocada es un pago real. Rechazar, ademas, pide un motivo: es lo que
 *    permite entender despues por que se detuvo algo.
 *  - Las aprobaciones vencen solas (el backend las expira). Se indica cuanto
 *    queda, y al expirar la fila deja de ser accionable sin recargar.
 */

import { useEffect, useState, type FormEvent } from 'react'

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { IconAprobaciones, IconCheck, IconReloj } from '@/components/icons'
import { ApprovalStatusBadge, Monto } from '@/components/domain'
import { useConfirm } from '@/hooks/useConfirm'
import {
  errorMessage,
  useAprobaciones,
  useAprobar,
  useRechazar,
} from '@/api/queries'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { Approval, ApprovalStatus } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Cuenta atras                                                      */
/* ------------------------------------------------------------------ */

/** "quedan 45 s" / "venció hace 2 min". Se recalcula sola. */
function VenceEn({ expiresAt }: { expiresAt: string }) {
  // Un temporizador por segundo es barato: solo hay una fila en PENDIENTE y
  // solo mientras la pantalla esta abierta.
  const [, forzar] = useState(0)
  useEffect(() => {
    const t = setInterval(() => forzar((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const restante = new Date(expiresAt).getTime() - Date.now()
  if (restante <= 0) {
    return <span className="text-2xs text-tinta-media">Venció {formatRelative(expiresAt)}</span>
  }
  const seg = Math.ceil(restante / 1000)
  if (seg < 60) return <span className="text-2xs text-tinta-media">Vence en {seg} s</span>
  return (
    <span className="text-2xs text-tinta-media">
      Vence en {Math.ceil(seg / 60)} min · {formatDateTime(expiresAt)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Fila                                                              */
/* ------------------------------------------------------------------ */

function Fila({
  aprobacion,
  onAprobar,
  onRechazar,
  ocupada,
}: {
  aprobacion: Approval
  onAprobar: () => void
  onRechazar: (motivo: string) => void
  ocupada: boolean
}) {
  const p = aprobacion.proposal
  const pendiente = aprobacion.status === 'PENDIENTE'
  const vencida = pendiente && new Date(aprobacion.expiresAt).getTime() <= Date.now()

  return (
    <article className="rounded-control border border-linea bg-superficie-1 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-base font-semibold tabular-nums text-tinta">
            {p ? <Monto amount={p.amount} asset={p.asset} /> : 'Importe desconocido'}
          </p>
          <p className="mt-0.5 text-xs text-tinta-media">
            {p?.contactName ? (
              <>
                para <span className="font-medium text-tinta">{p.contactName}</span>
              </>
            ) : (
              'sin destinatario identificado'
            )}
          </p>
        </div>
        <ApprovalStatusBadge status={aprobacion.status} />
      </div>

      {p?.originalText && (
        <blockquote className="mt-2 border-l-2 border-linea pl-2 text-xs italic text-tinta-media">
          «{p.originalText}»
        </blockquote>
      )}

      {aprobacion.reason && (
        <p className="mt-2 text-2xs text-tinta-media">Motivo: {aprobacion.reason}</p>
      )}

      <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-2">
        <span className="flex items-center gap-1.5">
          {pendiente ? (
            <VenceEn expiresAt={aprobacion.expiresAt} />
          ) : (
            <span className="text-2xs text-tinta-media">
              {aprobacion.decidedAt
                ? `Decidido ${formatRelative(aprobacion.decidedAt)}`
                : formatRelative(aprobacion.createdAt)}
            </span>
          )}
          {p?.status && (
            <span className="text-2xs text-tinta-media">· pago {p.status.toLowerCase()}</span>
          )}
        </span>

        {pendiente && !vencida && (
          <div className="flex gap-2">
            <Button
              variante="fantasma"
              tamano="sm"
              disabled={ocupada}
              onClick={() => onRechazar('')}
            >
              Rechazar
            </Button>
            <Button
              variante="primario"
              tamano="sm"
              disabled={ocupada}
              onClick={onAprobar}
            >
              <IconCheck className="h-3.5 w-3.5" />
              Aprobar y pagar
            </Button>
          </div>
        )}

        {vencida && (
          <span className="flex items-center gap-1 text-2xs text-aviso">
            <IconReloj className="h-3 w-3" /> Se venció sin decidir
          </span>
        )}
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Modal de rechazo                                                  */
/* ------------------------------------------------------------------ */

function ModalRechazo({
  aprobacion,
  abierto,
  onClose,
  onConfirmar,
  ocupado,
}: {
  aprobacion: Approval | null
  abierto: boolean
  onClose: () => void
  onConfirmar: (motivo: string) => void
  ocupado: boolean
}) {
  const [motivo, setMotivo] = useState('')

  function enviar(e: FormEvent) {
    e.preventDefault()
    onConfirmar(motivo.trim())
    setMotivo('')
  }

  return (
    <Modal
      abierto={abierto}
      onClose={onClose}
      titulo="¿Por qué lo rechazas?"
      descripcion="No es obligatorio, pero es lo único que permite entender después por qué el agente se detuvo."
      pie={
        <>
          <Button variante="fantasma" onClick={onClose} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variante="peligro" onClick={enviar} cargando={ocupado}>
            Rechazar el pago
          </Button>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <p className="text-sm text-tinta">
          Vas a impedir{' '}
          <span className="font-semibold">
            {aprobacion?.proposal ? (
              <Monto amount={aprobacion.proposal.amount} asset={aprobacion.proposal.asset} />
            ) : (
              'un pago'
            )}
          </span>{' '}
          {aprobacion?.proposal?.contactName && <>a {aprobacion.proposal.contactName}</>}. El
          agente no volverá a intentarlo por su cuenta.
        </p>

        <Field label="Motivo (opcional)">
          {(props) => (
            <Textarea
              {...props}
              value={motivo}
              placeholder="Por ejemplo: era para el alquiler del mes pasado, no este"
              onChange={(e) => setMotivo(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                            */
/* ------------------------------------------------------------------ */

const FILTROS: { valor: ApprovalStatus | null; texto: string }[] = [
  { valor: 'PENDIENTE', texto: 'Esperando tu OK' },
  { valor: null, texto: 'Todas' },
  { valor: 'APROBADA', texto: 'Aprobadas' },
  { valor: 'RECHAZADA', texto: 'Rechazadas' },
  { valor: 'EXPIRADA', texto: 'Vencidas' },
]

const TAMANO = 10

export function AprobacionesPage() {
  const [filtro, setFiltro] = useState<ApprovalStatus | null>('PENDIENTE')
  const [pagina, setPagina] = useState(0)
  const [aRechazar, setARechazar] = useState<Approval | null>(null)

  const aprobar = useAprobar()
  const rechazar = useRechazar()
  const confirmar = useConfirm()

  const { data, isPending, isError, error, refetch } = useAprobaciones(filtro, pagina, TAMANO)

  const total = data?.totalItems ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO))
  const ocupada = aprobar.isPending || rechazar.isPending

  async function aprobarUna(aprobacion: Approval) {
    try {
      const ok = await confirmar.confirmar({
        titulo: '¿Confirmas este pago?',
        mensaje: `Se pagarán ${aprobacion.proposal?.amount ?? '?'} ${
          aprobacion.proposal?.asset ?? 'USDC'
        } a ${aprobacion.proposal?.contactName ?? 'ese contacto'}. No se puede deshacer.`,
        textoConfirmar: 'Sí, pagar',
        peligro: false,
      })
      if (!ok) return
      await aprobar.mutateAsync(aprobacion.id)
    } catch (err) {
      confirmar.error('No se pudo aprobar', errorMessage(err))
    }
  }

  async function rechazarUna(motivo: string) {
    if (!aRechazar) return
    try {
      await rechazar.mutateAsync({ id: aRechazar.id, reason: motivo || undefined })
      setARechazar(null)
    } catch (err) {
      confirmar.error('No se pudo rechazar', errorMessage(err))
    }
  }

  return (
    <div className="contenedor py-6">
      <header className="pagina-cabecera">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-tinta">Aprobaciones</h1>
            <p className="mt-0.5 text-sm text-tinta-media">
              Pagos que el agente entendió y que están dentro de tus topes, pero que superan el
              monto a partir del cual le diste permiso para actuar solo.
            </p>
          </div>

          <Select
            value={filtro ?? ''}
            aria-label="Filtrar aprobaciones"
            onChange={(e) => {
              setFiltro(e.target.value === '' ? null : (e.target.value as ApprovalStatus))
              setPagina(0)
            }}
          >
            {FILTROS.map((f) => (
              <option key={f.texto} value={f.valor ?? ''}>
                {f.texto}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {(ocupada || aprobar.isError || rechazar.isError) && (
        <p role="alert" className="mt-3 text-xs text-error">
          {ocupada
            ? 'Enviando la orden a Stellar…'
            : errorMessage(aprobar.error ?? rechazar.error)}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}

        {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

        {!isPending && !isError && total === 0 && (
          <EmptyState
            icono={<IconAprobaciones className="h-5 w-5" />}
            titulo={filtro === 'PENDIENTE' ? 'Nada esperando tu OK' : 'Sin aprobaciones'}
            descripcion={
              filtro === 'PENDIENTE'
                ? 'Cuando pidas algo por encima de tu umbral aparecerá aquí para que lo confirmes.'
                : 'No hay aprobaciones con este filtro.'
            }
          />
        )}

        {data?.items.map((aprobacion) => (
          <Fila
            key={aprobacion.id}
            aprobacion={aprobacion}
            ocupada={ocupada}
            onAprobar={() => void aprobarUna(aprobacion)}
            onRechazar={() => setARechazar(aprobacion)}
          />
        ))}
      </div>

      {total > TAMANO && (
        <div className="mt-4">
          <Pagination
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalElementos={total}
            sustantivo="aprobaciones"
            onChange={setPagina}
          />
        </div>
      )}

      <ModalRechazo
        aprobacion={aRechazar}
        abierto={aRechazar !== null}
        onClose={() => setARechazar(null)}
        onConfirmar={(m) => void rechazarUna(m)}
        ocupado={rechazar.isPending}
      />
    </div>
  )
}

