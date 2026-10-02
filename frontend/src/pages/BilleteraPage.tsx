/**
 * Mi billetera: la cuenta, lo que se puede gastar hoy y los ultimos pagos.
 *
 * Tres bloques, uno debajo del otro, y en cada uno una sola idea:
 *  1. La tarjeta: cuanto queda para hoy. Nada mas. Los datos tecnicos de la
 *     cuenta (direccion, registro publico) van debajo, plegados.
 *  2. El resumen: cuatro cifras, sin graficos.
 *  3. Los ultimos movimientos. La fila no es un enlace: el comprobante es
 *     una accion aparte y discreta.
 *
 * Lo que esta pantalla NO inventa:
 *  - El saldo. No hay endpoint que lo lea de Stellar, asi que se dice
 *    "proximamente" en vez de enseñar una cifra falsa.
 *  - Los ingresos. El historial solo trae pagos SALIENTES: una cifra de
 *    "entro" seria siempre cero y daria a entender que no entra nada.
 *  - Totales historicos. El historial llega paginado y aqui solo se pide la
 *    primera pagina.
 *
 * La tarjeta es de muestra y lo dice: quien no tiene practica con lo digital
 * puede creer que es una tarjeta real con la que pagar en una tienda.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge, Button, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui'
import {
  IconCheck,
  IconCopiar,
  IconExterno,
  IconFlechaAbajo,
  IconHistorial,
  LogoNexora,
} from '@/components/icons'
import { Monto, ProposalStatusBadge } from '@/components/domain'
import { limpiarMarcadores } from '@/components/Propuesta'
import { useCopy } from '@/hooks'
import { useHistorial, useLimites } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { cn } from '@/lib/cn'
import { formatAmount, formatDate, formatDateTime, formatFechaAmigable } from '@/lib/format'
import { explorerAddress, explorerTx, shortKey } from '@/lib/stellar'
import type { Account, HistoryItem, MandateStatus, ProposalStatus } from '@/api/types'

/** Cuantos movimientos se enseñan aqui. El resto, en "Mis movimientos". */
const CUANTOS = 10

/** Clases de los controles grandes de esta pantalla: 48 px de alto. */
const CONTROL_GRANDE = 'min-h-12 px-5 text-base'

/** Lo que se dice de cualquier enlace al registro publico de Stellar. */
const AVISO_REGISTRO = 'Abre el registro público de Stellar en otra pestaña'

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
/* Movimientos: utilidades                                            */
/* ------------------------------------------------------------------ */

/** Pagos que no movieron dinero: se pintan apagados y con el monto tachado. */
function noSalio(status: ProposalStatus): boolean {
  return status === 'FALLIDO' || status === 'RECHAZADO'
}

/**
 * Ultimo instante real del movimiento. `HistoryItem` no trae fecha de
 * creacion, asi que se usa la confirmacion o, si no hubo, el envio.
 */
function instanteDe(item: HistoryItem): string | null {
  return item.confirmedAt ?? item.sentAt ?? null
}

/** El movimiento ocurrio en las ultimas 24 h (la misma ventana que el tope). */
function enUltimas24h(item: HistoryItem, ahoraMs: number): boolean {
  const instante = instanteDe(item)
  if (!instante) return false
  const ms = new Date(instante).getTime()
  return !Number.isNaN(ms) && ms >= ahoraMs - 24 * 60 * 60 * 1000 && ms <= ahoraMs
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
          Lo que puedes gastar hoy y tus últimos pagos.
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

/** Tipo de cuenta en palabras, sin "testnet". El backend solo admite TESTNET. */
function nombreCuenta(account: Account | null): string {
  if (!account) return 'Sin cuenta registrada'
  const red = account.network.trim().toUpperCase()
  if (red === 'TESTNET') return 'Cuenta de prueba'
  if (red === 'PUBLIC' || red === 'MAINNET') return 'Cuenta real'
  return account.network
}

function BloqueTarjeta({ account, topes }: { account: Account | null; topes: EstadoTopes }) {
  return (
    <section aria-labelledby="billetera-tarjeta" className="flex flex-col gap-4">
      <h2 id="billetera-tarjeta" className="text-xl font-semibold text-tinta">
        Tu cuenta
      </h2>

      {/* Tarjeta plana: borde de 1 px, sin sombra, sin degradado, sin giro.
          Dentro solo lo esencial: marca, "de muestra" y lo disponible hoy. */}
      <div className="flex flex-col gap-6 rounded-card border border-filete-fuerte bg-superficie p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <LogoNexora alto={32} />
            <div>
              <p className="text-lg font-semibold text-tinta">Nexora</p>
              <p className="text-base text-tinta-media">{nombreCuenta(account)}</p>
            </div>
          </div>
          <Badge tone="neutro" tamano="grande">
            Tarjeta de muestra
          </Badge>
        </div>

        <DisponibleHoy topes={topes} />
      </div>

      <div className="space-y-1 text-base text-tinta-media">
        <p>
          <span className="font-medium text-tinta">Saldo: próximamente.</span> Todavía no lo
          leemos de Stellar.
        </p>
        <p>La tarjeta es solo una muestra: no sirve para pagar en tiendas.</p>
      </div>

      {account ? (
        <DatosCuenta account={account} />
      ) : (
        <p className="text-base text-tinta-media">
          No hay ninguna cuenta de Stellar registrada todavía.
        </p>
      )}
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
        <p className="text-xl font-semibold text-tinta">{titulo}</p>
        <p className="text-base text-tinta-media">
          Sin reglas activas, Nexora no puede pagar por ti.
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
      <p className="text-lg text-tinta-media">Disponible hoy</p>
      <p className="cifras text-3xl font-semibold text-oro">
        {formatAmount(availableLast24h, asset)}
      </p>
      <p className="text-lg text-tinta">
        de un tope diario de{' '}
        <span className="cifras font-medium">{formatAmount(dailyLimit, asset)}</span>
      </p>
      <p className="mt-1 text-base text-tinta-media">
        Cuenta las últimas 24 horas
        {expiresAt ? ` · reglas hasta el ${formatDate(expiresAt)}` : ''}
      </p>
    </div>
  )
}

/**
 * Datos tecnicos de la cuenta, plegados: la direccion abreviada, copiarla y
 * verla en el registro publico. Hacen falta poco, asi que no estorban.
 */
function DatosCuenta({ account }: { account: Account }) {
  const direccion = account.smartAccountAddress
  const href = account.explorerUrl ?? explorerAddress(direccion)

  return (
    <details className="group rounded-card border border-filete bg-superficie">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-medium text-tinta [&::-webkit-details-marker]:hidden">
        Datos de tu cuenta
        <IconFlechaAbajo className="h-5 w-5 shrink-0 text-tinta-media group-open:rotate-180" />
      </summary>

      <div className="flex flex-col gap-3 border-t border-filete px-4 py-4">
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
            title={AVISO_REGISTRO}
            className={`btn btn-secundario ${CONTROL_GRANDE}`}
          >
            Ver registro de la cuenta
            <IconExterno />
            <span className="solo-lector">({AVISO_REGISTRO.toLowerCase()})</span>
          </a>
        </div>
      </div>
    </details>
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
      <dt className="text-lg text-tinta-media">{etiqueta}</dt>
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

  // "Pagos de hoy" usa la misma ventana que el tope diario: 24 h moviles.
  // Solo cuentan los que la red confirmo. Si TODO lo cargado cae dentro de
  // la ventana y hay mas paginas, puede haber pagos de hoy sin cargar.
  const ahoraMs = Date.now()
  const pagosHoy = items.filter((i) => i.status === 'CONFIRMADO' && enUltimas24h(i, ahoraMs)).length
  const truncado =
    total > items.length && items.length > 0 && items.every((i) => enUltimas24h(i, ahoraMs))

  return (
    <dl className="valla m-0 sm:grid-cols-2">
      <Cifra
        etiqueta="Gastado hoy"
        valor={activos ? formatAmount(activos.spentLast24h, asset) : '—'}
        nota={activos ? 'En las últimas 24 horas' : sinReglas}
      />
      <Cifra
        etiqueta="Pagos de hoy"
        valor={truncado ? `${pagosHoy} o más` : pagosHoy}
        nota={
          truncado
            ? 'Confirmados en las últimas 24 horas. Hay más en Mis movimientos.'
            : 'Confirmados en las últimas 24 horas'
        }
      />
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

function FechaMovimiento({ item }: { item: HistoryItem }) {
  const instante = instanteDe(item)
  if (!instante) return <>Sin fecha: no llegó a enviarse</>
  return (
    <time dateTime={instante} title={formatDateTime(instante)}>
      {formatFechaAmigable(instante)}
    </time>
  )
}

/** Lo que oye un lector de pantalla antes del monto. */
function prefijoMonto(status: ProposalStatus): string {
  if (noSalio(status)) return 'No salió: '
  if (status === 'CONFIRMADO') return 'Enviaste '
  return 'En curso: '
}

function FilaMovimiento({ item }: { item: HistoryItem }) {
  const nombre = item.contactName ?? 'Destinatario sin nombre'
  const memo = item.memo ? limpiarMarcadores(item.memo) : ''
  const apagado = noSalio(item.status)

  // Rejilla: en movil todo apilado (datos, monto y estado, comprobante); en
  // pantallas anchas el monto y el estado ocupan la columna derecha y el
  // comprobante queda debajo de los datos, sin dejar huecos.
  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
      <div className="min-w-0 space-y-1">
        <p className={cn('text-lg font-medium', apagado ? 'text-tinta-media' : 'text-tinta')}>
          {nombre}
        </p>
        <p className="text-base text-tinta-media">
          <FechaMovimiento item={item} />
        </p>
        {memo && <p className="text-base text-tinta-media">«{memo}»</p>}
        {apagado && <p className="text-base text-tinta-media">No se movió dinero.</p>}
      </div>

      <div className="flex flex-col items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:items-end">
        <p
          className={cn(
            'cifras text-lg font-semibold',
            apagado ? 'text-tinta-media line-through' : 'text-tinta',
          )}
        >
          <span className="solo-lector">{prefijoMonto(item.status)}</span>
          <Monto amount={item.amount} asset={item.asset} />
        </p>
        <ProposalStatusBadge status={item.status} tamano="grande" />
      </div>

      {item.txHash && (
        <a
          href={item.explorerUrl ?? explorerTx(item.txHash)}
          target="_blank"
          rel="noreferrer noopener"
          title={AVISO_REGISTRO}
          className="-my-2 inline-flex min-h-12 items-center gap-1.5 justify-self-start text-base text-tinta-media underline underline-offset-2 hover:text-tinta sm:col-start-1"
        >
          Comprobante
          <IconExterno className="h-4 w-4" />
          <span className="solo-lector">
            {' '}
            del pago a {nombre} ({AVISO_REGISTRO.toLowerCase()})
          </span>
        </a>
      )}
    </li>
  )
}
