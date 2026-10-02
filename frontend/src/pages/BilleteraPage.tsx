/**
 * Mi billetera: la cuenta, lo que se puede gastar hoy y los ultimos pagos.
 *
 * Tres bloques, uno debajo del otro, y en cada uno una sola idea:
 *  1. La tarjeta: de quien es la cuenta y cuanto queda para hoy.
 *  2. El resumen: cuatro cifras, sin graficos.
 *  3. Los ultimos movimientos, con enlace a la red.
 *
 * Lo que esta pantalla NO inventa:
 *  - El saldo. No hay endpoint que lo lea de Stellar, asi que se dice
 *    "proximamente" en vez de enseñar una cifra falsa.
 *  - Los ingresos. El historial solo trae pagos SALIENTES: una cifra de
 *    "entro" seria siempre cero y daria a entender que no entra nada.
 *  - Totales historicos. El historial llega paginado y aqui solo se pide la
 *    primera pagina; lo que se cuenta se cuenta "entre los ultimos N".
 *
 * La tarjeta es de muestra y lo dice: quien no tiene practica con lo digital
 * puede creer que es una tarjeta real con la que pagar en una tienda.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge, Button, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui'
import { IconCheck, IconCopiar, IconExterno, IconHistorial, LogoNexora } from '@/components/icons'
import { Monto, ProposalStatusBadge } from '@/components/domain'
import { limpiarMarcadores } from '@/components/Propuesta'
import { useCopy } from '@/hooks'
import { useHistorial, useLimites } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { formatAmount, formatDateLong, formatDateTime } from '@/lib/format'
import { explorerAddress, explorerTx, shortKey } from '@/lib/stellar'
import type { Account, HistoryItem, MandateStatus } from '@/api/types'

/** Cuantos movimientos se ensenan aqui. El resto, en "Mis movimientos". */
const CUANTOS = 10

/** Clases de los controles grandes de esta pantalla: 48 px de alto. */
const CONTROL_GRANDE = 'min-h-12 px-5 text-base'

/* ------------------------------------------------------------------ */
/* Estado de los topes                                                */
/* ------------------------------------------------------------------ */

/** Los topes que se pintan cuando hay un mandato activo. */
interface TopesActivos {
  asset: string
  dailyLimit: string
  spentLast24h: string
  availableLast24h: string
  perTxLimit: string | null
  approvalThreshold: string | null
  expiresAt: string | null
}

type EstadoTopes =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: unknown; reintentar: () => void }
  | { tipo: 'sin-mandato'; status: MandateStatus | null }
  | { tipo: 'activo'; topes: TopesActivos }

/**
 * Sin mandato el backend responde con todos los campos de `Limits` a `null`
 * (asi lo hace tambien el mock). Por si alguna version respondiera con un
 * error de "sin mandato", ese codigo se trata igual y no como un fallo.
 */
function esSinMandato(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'SIN_MANDATO_ACTIVO' || code === 'SIN_MANDATO'
}

function useEstadoTopes(): EstadoTopes {
  const consulta = useLimites()

  if (consulta.isPending) return { tipo: 'cargando' }
  if (consulta.isError) {
    if (esSinMandato(consulta.error)) return { tipo: 'sin-mandato', status: null }
    return { tipo: 'error', error: consulta.error, reintentar: () => void consulta.refetch() }
  }

  const datos = consulta.data
  if (!datos) return { tipo: 'cargando' }

  if (datos.status !== 'ACTIVO' || datos.dailyLimit === null || datos.availableLast24h === null) {
    return { tipo: 'sin-mandato', status: datos.status }
  }

  return {
    tipo: 'activo',
    topes: {
      asset: datos.asset ?? 'USDC',
      dailyLimit: datos.dailyLimit,
      spentLast24h: datos.spentLast24h ?? '0',
      availableLast24h: datos.availableLast24h,
      perTxLimit: datos.perTxLimit,
      approvalThreshold: datos.approvalThreshold,
      expiresAt: datos.expiresAt,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Pagina                                                             */
/* ------------------------------------------------------------------ */

export function BilleteraPage() {
  const { account } = useSesion()
  const topes = useEstadoTopes()
  const historial = useHistorial(0, CUANTOS)

  const items = historial.data?.items ?? []
  const total = historial.data?.totalItems ?? 0

  return (
    <div className="contenedor flex max-w-3xl flex-col gap-10 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-tinta">Mi billetera</h1>
        <p className="text-lg text-tinta-media">
          Tu cuenta en Stellar, lo que puedes gastar hoy y tus últimos pagos.
        </p>
      </header>

      <BloqueTarjeta account={account} topes={topes} />

      <BloqueResumen
        topes={topes}
        items={items}
        total={total}
        cargandoHistorial={historial.isPending}
        errorHistorial={historial.isError ? historial.error : null}
        reintentarHistorial={() => void historial.refetch()}
      />

      <BloqueMovimientos
        items={items}
        cargando={historial.isPending}
        error={historial.isError ? historial.error : null}
        reintentar={() => void historial.refetch()}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Tarjeta                                                         */
/* ------------------------------------------------------------------ */

/** Nombre de la red en palabras. El backend solo admite TESTNET por ahora. */
function nombreRed(network: string): string {
  const red = network.trim().toUpperCase()
  if (red === 'TESTNET') return 'Testnet (red de pruebas)'
  if (red === 'PUBLIC' || red === 'MAINNET') return 'Red principal'
  return network
}

function BloqueTarjeta({ account, topes }: { account: Account | null; topes: EstadoTopes }) {
  return (
    <section aria-labelledby="billetera-tarjeta" className="flex flex-col gap-3">
      <h2 id="billetera-tarjeta" className="text-xl font-semibold text-tinta">
        Tu cuenta
      </h2>

      {/* Tarjeta plana: borde de 1 px, sin sombra, sin degradado, sin giro. */}
      <div className="flex flex-col gap-6 rounded-card border border-filete-fuerte bg-superficie p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <LogoNexora alto={32} />
            <div>
              <p className="text-lg font-semibold text-tinta">Nexora</p>
              <p className="text-base text-tinta-media">
                {account ? nombreRed(account.network) : 'Sin red'}
              </p>
            </div>
          </div>
          <Badge tone="neutro">Tarjeta de muestra</Badge>
        </div>

        <DisponibleHoy topes={topes} />

        <div className="rounded-control border border-filete bg-superficie-2 px-4 py-3">
          <p className="text-lg font-medium text-tinta">Saldo: próximamente</p>
          <p className="mt-1 text-base text-tinta-media">
            Todavía no leemos el saldo de tu cuenta en Stellar. Cuando esté listo, lo verás
            aquí.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-filete pt-5">
          {account ? (
            <DireccionCuenta account={account} />
          ) : (
            <p className="text-base text-tinta-media">
              No hay ninguna cuenta de Stellar registrada todavía.
            </p>
          )}
        </div>
      </div>

      <p className="text-base text-tinta-media">
        Es una tarjeta de muestra para ver tu cuenta de un vistazo: no sirve para pagar en tiendas.
      </p>
    </section>
  )
}

/** La cifra principal de la tarjeta, o lo que impide mostrarla. */
function DisponibleHoy({ topes }: { topes: EstadoTopes }) {
  if (topes.tipo === 'cargando') {
    return (
      <p className="flex items-center gap-2 text-base text-tinta-media">
        <Spinner className="h-5 w-5" />
        Leyendo lo que puedes gastar hoy…
      </p>
    )
  }

  if (topes.tipo === 'error') {
    return (
      <ErrorState
        titulo="No se pudo leer lo que puedes gastar hoy"
        error={topes.error}
        onReintentar={topes.reintentar}
        className="py-4"
      />
    )
  }

  if (topes.tipo === 'sin-mandato') {
    const titulo =
      topes.status === 'EXPIRADO'
        ? 'Tus reglas de pago vencieron'
        : topes.status === 'REVOCADO'
          ? 'Tus reglas de pago están revocadas'
          : 'No tienes reglas de pago activas'
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-lg font-medium text-tinta">{titulo}</p>
        <p className="text-base text-tinta-media">
          Sin reglas activas, Nexora no puede pagar por ti, así que hoy no hay nada disponible.
        </p>
        <Link to="/mandato" className={`btn btn-primario ${CONTROL_GRANDE}`}>
          Ir a Mis reglas de pago
        </Link>
      </div>
    )
  }

  const { asset, availableLast24h, dailyLimit, expiresAt } = topes.topes
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base text-tinta-media">Disponible hoy</p>
      <p className="cifras text-3xl font-semibold text-oro">
        {formatAmount(availableLast24h, asset)}
      </p>
      <p className="text-lg text-tinta">
        de un tope diario de{' '}
        <span className="cifras font-medium">{formatAmount(dailyLimit, asset)}</span>
      </p>
      <p className="mt-1 text-base text-tinta-media">
        Cuenta lo pagado en las últimas 24 horas.
        {expiresAt && <> Tus reglas valen hasta el {formatDateLong(expiresAt)}.</>}
      </p>
    </div>
  )
}

/** Direccion abreviada, boton de copiar la completa y enlace al explorador. */
function DireccionCuenta({ account }: { account: Account }) {
  const direccion = account.smartAccountAddress
  const href = account.explorerUrl ?? explorerAddress(direccion)

  return (
    <>
      <div>
        <p className="text-base text-tinta-media">Dirección de tu cuenta</p>
        <p className="mono text-lg text-tinta" title={direccion}>
          {shortKey(direccion)}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <BotonCopiar valor={direccion} />
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={`btn btn-secundario ${CONTROL_GRANDE}`}
        >
          Ver en el explorador
          <IconExterno />
          <span className="solo-lector">(se abre en otra pestaña)</span>
        </a>
      </div>
    </>
  )
}

function BotonCopiar({ valor }: { valor: string }) {
  const { copiado, copiar } = useCopy(valor)
  return (
    <>
      <Button variante="secundario" onClick={() => void copiar()} className={CONTROL_GRANDE}>
        {copiado ? <IconCheck /> : <IconCopiar />}
        {copiado ? 'Dirección copiada' : 'Copiar dirección'}
      </Button>
      <span role="status" className="solo-lector">
        {copiado ? 'Dirección copiada' : ''}
      </span>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Resumen                                                         */
/* ------------------------------------------------------------------ */

/** Cifra grande con su etiqueta: dentro de un `<dl class="valla">`. */
function Cifra({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: ReactNode
  nota?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:p-5">
      <dt className="text-base text-tinta-media">{etiqueta}</dt>
      <dd className="m-0 cifras text-2xl font-semibold text-tinta">{valor}</dd>
      {nota && <dd className="m-0 text-base text-tinta-media">{nota}</dd>}
    </div>
  )
}

function BloqueResumen({
  topes,
  items,
  total,
  cargandoHistorial,
  errorHistorial,
  reintentarHistorial,
}: {
  topes: EstadoTopes
  items: HistoryItem[]
  total: number
  cargandoHistorial: boolean
  errorHistorial: unknown
  reintentarHistorial: () => void
}) {
  const cargando = topes.tipo === 'cargando' || cargandoHistorial
  const fallaTopes = topes.tipo === 'error'
  const fallaHistorial = errorHistorial !== null

  return (
    <section aria-labelledby="billetera-resumen" className="flex flex-col gap-3">
      <h2 id="billetera-resumen" className="text-xl font-semibold text-tinta">
        Resumen
      </h2>

      {fallaTopes || fallaHistorial ? (
        <ErrorState
          titulo="No se pudo cargar el resumen"
          error={topes.tipo === 'error' ? topes.error : errorHistorial}
          onReintentar={() => {
            if (topes.tipo === 'error') topes.reintentar()
            if (fallaHistorial) reintentarHistorial()
          }}
          className="rounded-card border border-filete bg-superficie"
        />
      ) : cargando ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <ResumenCifras topes={topes} items={items} total={total} />
      )}

      {cargando && !fallaTopes && !fallaHistorial && (
        <p className="solo-lector">Cargando el resumen</p>
      )}

      <p className="text-base text-tinta-media">
        Aquí solo aparecen los pagos que salen. Lo que entra a tu cuenta llegará junto con el
        saldo.
      </p>
    </section>
  )
}

function ResumenCifras({
  topes,
  items,
  total,
}: {
  topes: EstadoTopes
  items: HistoryItem[]
  total: number
}) {
  const activos = topes.tipo === 'activo' ? topes.topes : null
  const asset = activos?.asset ?? 'USDC'
  const sinReglas = 'Sin reglas de pago activas'

  // Solo los que la red confirmo: un pago FALLIDO o ENVIADO no ha movido
  // dinero todavia. Y solo entre los que se han cargado, no del historico.
  const confirmados = items.filter((i) => i.status === 'CONFIRMADO').length
  const notaPagos =
    items.length === 0
      ? 'Todavía no hay movimientos'
      : `Confirmados en la red, entre tus últimos ${items.length} movimientos` +
        (total > items.length ? ` (tienes ${total} en total)` : '')

  return (
    <dl className="valla m-0 sm:grid-cols-2">
      <Cifra
        etiqueta="Gastado en 24 h"
        valor={activos ? formatAmount(activos.spentLast24h, asset) : '—'}
        nota={activos ? 'Pagos de las últimas 24 horas' : sinReglas}
      />
      <Cifra etiqueta="Pagos enviados" valor={confirmados} nota={notaPagos} />
      <Cifra
        etiqueta="Tope por pago"
        valor={activos?.perTxLimit ? formatAmount(activos.perTxLimit, asset) : '—'}
        nota={activos ? 'Ningún pago puede pasar de aquí' : sinReglas}
      />
      <Cifra
        etiqueta="Pide aprobación desde"
        valor={activos?.approvalThreshold ? formatAmount(activos.approvalThreshold, asset) : '—'}
        nota={activos ? 'Desde este monto, Nexora te pregunta antes de pagar' : sinReglas}
      />
    </dl>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Movimientos                                                     */
/* ------------------------------------------------------------------ */

function BloqueMovimientos({
  items,
  cargando,
  error,
  reintentar,
}: {
  items: HistoryItem[]
  cargando: boolean
  error: unknown
  reintentar: () => void
}) {
  return (
    <section aria-labelledby="billetera-movimientos" className="flex flex-col gap-3">
      <div>
        <h2 id="billetera-movimientos" className="text-xl font-semibold text-tinta">
          Últimos movimientos
        </h2>
        <p className="mt-1 text-base text-tinta-media">
          Los pagos que salieron de tu cuenta, del más reciente al más antiguo.
        </p>
      </div>

      {error !== null ? (
        <ErrorState
          titulo="No se pudieron cargar tus movimientos"
          error={error}
          onReintentar={reintentar}
          className="rounded-card border border-filete bg-superficie"
        />
      ) : cargando ? (
        <p className="flex items-center gap-2 rounded-card border border-filete bg-superficie px-4 py-6 text-base text-tinta-media">
          <Spinner className="h-5 w-5" />
          Cargando tus movimientos…
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-filete bg-superficie">
          <EmptyState
            icono={<IconHistorial />}
            titulo="Todavía no hay movimientos"
            descripcion="Cuando pidas tu primer pago en el chat, aparecerá aquí con su estado."
            accion={
              <Link to="/" className={`btn btn-primario ${CONTROL_GRANDE}`}>
                Ir al chat
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <ul className="m-0 list-none divide-y divide-filete rounded-card border border-filete bg-superficie p-0">
            {items.map((item) => (
              <FilaMovimiento key={item.proposalId} item={item} />
            ))}
          </ul>
          <Link to="/historial" className={`btn btn-secundario self-start ${CONTROL_GRANDE}`}>
            Ver todos mis movimientos
          </Link>
        </>
      )}
    </section>
  )
}

/**
 * Cuando paso, en palabras. `HistoryItem` no trae fecha de creacion: se usa
 * el ultimo instante real que hay, igual que en "Mis movimientos".
 */
function FechaMovimiento({ item }: { item: HistoryItem }) {
  if (item.confirmedAt) {
    return (
      <>
        Confirmado el <time dateTime={item.confirmedAt}>{formatDateTime(item.confirmedAt)}</time>
      </>
    )
  }
  if (item.sentAt) {
    return (
      <>
        {item.status === 'ENVIADO' ? 'Enviado el ' : 'Intentado el '}
        <time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time>
        {item.status === 'ENVIADO' && ', esperando confirmación'}
      </>
    )
  }
  return <>Sin fecha: no llegó a firmarse</>
}

function FilaMovimiento({ item }: { item: HistoryItem }) {
  const nombre = item.contactName ?? 'Destinatario sin nombre'
  const memo = item.memo ? limpiarMarcadores(item.memo) : ''

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0 space-y-1">
        <p className="text-lg font-medium text-tinta">{nombre}</p>
        {!item.contactName && item.destinationAddress && (
          <p className="mono text-base text-tinta-media" title={item.destinationAddress}>
            {shortKey(item.destinationAddress)}
          </p>
        )}
        <p className="text-base text-tinta-media">
          <FechaMovimiento item={item} />
        </p>
        {memo && <p className="text-base text-tinta-media">«{memo}»</p>}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <p className="cifras text-lg font-semibold text-tinta">
          <span className="solo-lector">Enviaste </span>
          <Monto amount={item.amount} asset={item.asset} />
        </p>
        <ProposalStatusBadge status={item.status} />
        {item.txHash && (
          <a
            href={item.explorerUrl ?? explorerTx(item.txHash)}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-fantasma min-h-12 px-3 text-base text-tinta underline underline-offset-2"
          >
            Ver en el explorador
            <IconExterno />
            <span className="solo-lector">
              {' '}
              el pago a {nombre} (se abre en otra pestaña)
            </span>
          </a>
        )}
      </div>
    </li>
  )
}
