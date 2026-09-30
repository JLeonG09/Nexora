/**
 * Auditoría: la traza completa, evento a evento.
 *
 * Es la pantalla que responde a "¿por qué pasó esto?" cuando nada más lo
 * explica. Por eso el detalle es el protagonista y la tabla solo indexa.
 *
 * Tres decisiones que conviene no deshacer:
 *
 *  - Se enseña QUIÉN actuó (tú, la IA, el backend, el firmante o la red). Es la
 *    diferencia entre "el agente decidió esto" y "la regla lo decidió", y son
 *    dos responsabilidades distintas.
 *  - Se enseña el resultado de la decisión en el propio evento: una validación
 *    que pasó y una que falló se leen distinto porque el backend guardó
 *    `VALIDACION_OK` o `VALIDACION_RECHAZADA`. El color solo acompaña.
 *  - Los datos crudos del evento (`data`) están ocultos detrás de un desplegable
 *    y no por estorbo: son JSON de contrato, útiles para depurar y no para leer.
 */

import { useState } from 'react'
import { EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui'
import { IconAuditoria } from '@/components/icons'
import { ActorBadge, eventoLabel } from '@/components/domain'
import { useAuditoria } from '@/api/queries'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { AuditEvent, AuditEventType } from '@/api/types'

const TAMANO = 25

/* ------------------------------------------------------------------ */
/* Eventos que cambian algo                                           */
/* ------------------------------------------------------------------ */

/**
 * Los que el usuario tiene que notar aunque esté leyendo de pasada.
 * Separarlos del resto evita que un "CONTACT_CREAD" tape un "LLAVE_ROTADA".
 */
const DESTACADOS: AuditEventType[] = [
  'PROPUESTA_CREADA',
  'VALIDACION_RECHAZADA',
  'APROBACION_APROBADA',
  'APROBACION_RECHAZADA',
  'FIRMA_SOLICITADA',
  'TX_CONFIRMADA',
  'TX_FALLIDA',
  'MANDATO_CREADO',
  'MANDATO_REVOCADO',
  'ATAQUE_DEMO',
  'LLAVE_ROTADA',
  'LLAVE_COMPROMETIDA',
  'MOVIMIENTO_NO_RECONOCIDO',
]

/** Un tono por familia de evento, para escanear la traza de un vistazo. */
function tonoEvento(tipo: AuditEventType): string {
  if (tipo === 'TX_CONFIRMADA') return 'text-ok'
  if (tipo === 'TX_FALLIDA' || tipo === 'VALIDACION_RECHAZADA' || tipo === 'LLAVE_COMPROMETIDA')
    return 'text-error'
  if (tipo === 'MOVIMIENTO_NO_RECONOCIDO' || tipo === 'ATAQUE_DEMO') return 'text-aviso'
  if (tipo.startsWith('APROBACION') || tipo.startsWith('MANDATO')) return 'text-acento'
  return 'text-tinta'
}

/* ------------------------------------------------------------------ */
/* Fila                                                               */
/* ------------------------------------------------------------------ */

function FilaAuditoria({ evento }: { evento: AuditEvent }) {
  const [abierto, setAbierto] = useState(false)
  const destacado = DESTACADOS.includes(evento.eventType)
  const hayDatos = evento.data !== null && Object.keys(evento.data).length > 0

  return (
    <li className="border-b border-linea last:border-b-0">
      <div
        className={cn(
          'flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2',
          destacado && 'bg-superficie-2/40',
        )}
      >
        <time
          dateTime={evento.occurredAt}
          title={formatDateTime(evento.occurredAt)}
          className="w-32 shrink-0 text-2xs text-tinta-media"
        >
          {formatRelative(evento.occurredAt)}
        </time>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', tonoEvento(evento.eventType))}>
            {eventoLabel(evento.eventType)}
          </p>
          <p className="mt-0.5 text-xs text-tinta-media">{evento.summary}</p>

          {hayDatos && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                className="text-2xs text-tinta-media underline underline-offset-2 hover:text-tinta"
              >
                {abierto ? 'Ocultar datos' : 'Ver datos del evento'}
              </button>

              {abierto && (
                <pre className="mono mt-1 max-h-64 overflow-auto rounded-control bg-superficie-2 p-2 text-2xs text-tinta-media">
                  {JSON.stringify(evento.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ActorBadge actor={evento.actor} />
          {evento.proposalId && (
            <span
              className="font-mono text-2xs text-tinta-media"
              title={`Propuesta ${evento.proposalId}`}
            >
              {evento.proposalId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Página                                                            */
/* ------------------------------------------------------------------ */

export function AuditoriaPage() {
  const [pagina, setPagina] = useState(0)
  const [soloDestacados, setSoloDestacados] = useState(false)

  const { data, isPending, isError, error, refetch } = useAuditoria(null, pagina, TAMANO)

  const items = (data?.items ?? []).filter(
    (e) => !soloDestacados || DESTACADOS.includes(e.eventType),
  )
  const total = data?.totalItems ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO))

  return (
    <div className="contenedor flex flex-col gap-4 py-6">
      <header className="pagina-cabecera">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-tinta">Auditoría</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">
              Todo lo que ha pasado, en orden, con quién lo hizo. Es el registro que permite
              reconstruir por qué un pago salió o no salió.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-2xs text-tinta-media">
            <input
              type="checkbox"
              checked={soloDestacados}
              onChange={(e) => setSoloDestacados(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-acento)]"
            />
            Solo lo que cambió algo
          </label>
        </div>
      </header>

      {isPending && <Skeleton className="h-72" />}

      {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

      {!isPending && !isError && total === 0 && (
        <EmptyState
          icono={<IconAuditoria className="h-5 w-5" />}
          titulo="Todavía no hay eventos"
          descripcion="En cuanto pidas un pago o crees tu mandato, cada paso quedará registrado aquí."
        />
      )}

      {items.length > 0 && (
        <ul className="rounded-control border border-linea bg-superficie-1">
          {items.map((evento) => (
            <FilaAuditoria key={evento.id} evento={evento} />
          ))}
        </ul>
      )}

      {!isPending && total > 0 && items.length === 0 && (
        <p className="text-sm text-tinta-media">
          En esta página no hay eventos de ese tipo. Prueba a desactivar el filtro.
        </p>
      )}

      {total > TAMANO && (
        <Pagination
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalElementos={total}
          sustantivo="eventos"
          onChange={setPagina}
        />
      )}
    </div>
  )
}
