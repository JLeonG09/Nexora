/**
 * Historial de pagos.
 *
 * Una tabla, pero con una regla: cada fila tiene que explicar por qué pasó
 * lo que pasó. `Aprobado por el agente` y `lo aprobaste tú` no son lo mismo, y
 * `firmado` y `confirmado en la red` tampoco: uno es una intención de pago y
 * el otro es dinero movido. Mezclarlos es como aparecen los "__"
 * malentendidos en un producto de pagos.
 *
 * Los estados que un día se quedaron a medias (ENVIADO sin confirmar, FALLIDO)
 * se muestran igual que los demás. Borrarlos de la vista esconde justo lo que
 * el usuario necesita reconciliar.
 */

import { useState } from 'react'

import { EmptyState, ErrorState, Kpi, Pagination, Skeleton } from '@/components/ui'
import { IconHistorial } from '@/components/icons'
import { Monto, ProposalStatusBadge } from '@/components/domain'
import { EnlaceTx, EtiquetaAprobador } from '@/components/Propuesta'
import { useHistorial } from '@/api/queries'
import { formatAmount, formatDateTime, formatRelative, sumarImportes } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { HistoryItem } from '@/api/types'

const TAMANO = 15

export function HistorialPage() {
  const [pagina, setPagina] = useState(0)
  const { data, isPending, isError, error, refetch } = useHistorial(pagina, TAMANO)

  const items = data?.items ?? []
  const total = data?.totalItems ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO))

  return (
    <div className="contenedor flex flex-col gap-4 py-6">
      <header className="pagina-cabecera">
        <h1 className="text-lg font-semibold tracking-tight text-tinta">Historial</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">
          Cada pago que has pedido, con quién lo aprobó y si llegó a moverse el dinero.
        </p>
      </header>

      {data && <Resumen items={items} />}

      {isPending && <Skeleton className="h-64" />}

      {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

      {!isPending && !isError && items.length === 0 && (
        <EmptyState
          icono={<IconHistorial className="h-5 w-5" />}
          titulo="Todavía no hay pagos"
          descripcion="Cuando pidas el primero en el chat, aparecerá aquí con su estado y su enlace a la red."
        />
      )}

      {items.length > 0 && (
        <>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Importe</th>
                  <th scope="col">Destinatario</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Aprobó</th>
                  <th scope="col">En la red</th>
                  <th scope="col">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <FilaHistorial key={item.proposalId} item={item} />
                ))}
              </tbody>
            </table>
          </div>

          {total > TAMANO && (
            <Pagination
              pagina={pagina}
              totalPaginas={totalPaginas}
              totalElementos={total}
              sustantivo="pagos"
              onChange={setPagina}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resumen de la página                                               */
/* ------------------------------------------------------------------ */

/**
 * Tres cifras de la página actual, no del histórico entero.
 *
 * Es tentador poner "total gastado histórico" y no tiene sentido: mezclaría
 * pagos de hace meses con los de hoy, que es justo lo que el mandato controla
 * por separado. Lo que tiene sentido es "en esta pantalla".
 */
function Resumen({ items }: { items: HistoryItem[] }) {
  const confirmados = items.filter((i) => i.status === 'CONFIRMADO')
  const enCurso = items.filter((i) => i.status === 'ENVIADO' || i.status === 'PENDIENTE_APROBACION')
  const fallidos = items.filter((i) => i.status === 'FALLIDO' || i.status === 'RECHAZADO')

  // Suma exacta en string: "0.1" + "0.2" en coma flotante da 0.30000000000000004,
  // y una cifra así en pantalla parece un fallo. Ver `sumarImportes`.
  const suma = (lista: HistoryItem[]) => sumarImportes(lista.map((i) => i.amount))

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi
        etiqueta="Confirmados en esta página"
        valor={<span className="cifras">{formatAmount(suma(confirmados))} USDC</span>}
        nota={`${confirmados.length} pago${confirmados.length === 1 ? '' : 's'}`}
        vivo={confirmados.length > 0}
      />
      <Kpi
        etiqueta="En curso"
        valor={<span className="cifras">{enCurso.length}</span>}
        nota="Firmados o esperando tu OK"
      />
      <Kpi
        etiqueta="No salieron"
        valor={<span className="cifras">{fallidos.length}</span>}
        nota="Rechazados o fallidos"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fila                                                               */
/* ------------------------------------------------------------------ */

function FilaHistorial({ item }: { item: HistoryItem }) {
  const esperando = item.status === 'ENVIADO' || item.status === 'PENDIENTE_APROBACION'

  return (
    <tr className={cn(esperando && 'bg-superficie-2/40')}>
      <td className="font-medium tabular-nums text-tinta">
        <Monto amount={item.amount} asset={item.asset} />
      </td>
      <td className="text-tinta">{item.contactName ?? '—'}</td>
      <td>
        <ProposalStatusBadge status={item.status} />
      </td>
      <td>
        <EtiquetaAprobador por={item.approvedBy} />
      </td>
      <td>
        {item.txHash ? (
          <div className="flex flex-col gap-0.5">
            <EnlaceTx txHash={item.txHash} explorerUrl={item.explorerUrl} texto="Ver" />
            {item.confirmedAt && (
              <span className="text-2xs text-tinta-media">
                confirmado {formatRelative(item.confirmedAt)}
              </span>
            )}
            {!item.confirmedAt && item.sentAt && (
              <span className="text-2xs text-aviso">
                firmado {formatRelative(item.sentAt)}, sin confirmar
              </span>
            )}
          </div>
        ) : (
          <span className="text-2xs text-tinta-media">—</span>
        )}
      </td>
      <td>
        <MarcaTiempo item={item} />
      </td>
    </tr>
  )
}

/**
 * Cuándo pasó esto.
 *
 * `HistoryItemResponse` no trae `createdAt`: para una propuesta que nunca llegó
 * a firmarse no hay ningún instante que mostrar, y poner la fecha de creación
 * del movimiento seria inventarla. Se usa el último dato real que hay.
 */
function MarcaTiempo({ item }: { item: HistoryItem }) {
  const instante = item.confirmedAt ?? item.sentAt ?? null

  if (!instante) {
    return <span className="text-2xs text-tinta-media">nunca se firmó</span>
  }

  return (
    <time dateTime={instante} title={formatDateTime(instante)} className="text-2xs text-tinta-media">
      {formatRelative(instante)}
    </time>
  )
}
