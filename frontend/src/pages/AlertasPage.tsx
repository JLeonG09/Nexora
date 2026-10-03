/**
 * Alertas: dinero que salió sin que el agente lo pidiera.
 *
 * Esta es la pantalla MAS IMPORTANTE del producto y la que mas facil es de
 * diseñar mal. Aquí no hay una confirmación de la UI que valga: el movimiento
 * ya esta hecho en la red. El unico recurso real del usuario son dos
 * decisiones, y las dos tienen consecuencias distintas:
 *
 *   "Sí, fui yo"      -> el mandato sigue vivo. El backend cierra la alerta.
 *   "No, no fui yo"   -> revoca el mandato Y rota la llave del agente. La
 *                        llave vieja queda inutil para siempre, y hay que
 *                        decirlo antes de pedir el clic, no despues.
 *
 * Por eso el boton de reportar pide confirmacion con dos pasos y muestra de
 * forma visible lo que va a pasar: el mandato que se pierde y la version de
 * llave que pasa a ser la vigente. Un "rechazar" sin explicar es peor que no
 * ofrecer la opcion.
 */

import { useState } from 'react'

import { Button, EmptyState, ErrorState, Modal, Pagination, Select, Skeleton } from '@/components/ui'
import { IconAlertaMovimiento, IconCheck, IconBloqueo } from '@/components/icons'
import { AlertStatusBadge, Monto } from '@/components/domain'
import { EnlaceTx } from '@/components/Propuesta'
import { useConfirm } from '@/hooks/useConfirm'
import {
  errorMessage,
  useAlertas,
  useConfirmarAlerta,
  useReportarAlerta,
} from '@/api/queries'
import { useMandatoActivo } from '@/api/queries'
import { formatDateTime, formatRelative } from '@/lib/format'
import { SoloAvanzado } from '@/modo'
import { ESTADO_ALERTA, etiquetaActivoEnTexto, type Modo } from '@/modo/textos'
import { useModo, useTexto } from '@/modo/useModo'
import type { Alert, AlertStatus } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Fila                                                              */
/* ------------------------------------------------------------------ */

function Fila({
  alerta,
  onConfirmar,
  onReportar,
  ocupada,
}: {
  alerta: Alert
  onConfirmar: () => void
  onReportar: () => void
  ocupada: boolean
}) {
  const pendiente = alerta.status === 'PENDIENTE'
  const t = useTexto()
  const modo = useModo()

  return (
    <article
      className={`rounded-control border p-3 ${
        pendiente ? 'border-error/40 bg-error-50/40' : 'border-linea bg-superficie-1'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-base font-semibold tabular-nums text-tinta">
            <Monto amount={alerta.amount} asset={alerta.asset} />
          </p>
          <p className="mt-0.5 text-xs text-tinta-media">
            {t('alertaHacia')}
            {/* La direccion G… es un detalle tecnico: solo en Avanzado. */}
            <SoloAvanzado>
              {' '}
              <span className="font-mono text-tinta">
                {alerta.destinationAddress
                  ? `${alerta.destinationAddress.slice(0, 6)}…${alerta.destinationAddress.slice(-4)}`
                  : 'una cuenta desconocida'}
              </span>
            </SoloAvanzado>
          </p>
        </div>
        <AlertStatusBadge status={alerta.status} />
      </div>

      <p className="mt-2 text-sm text-tinta">{etiquetaActivoEnTexto(alerta.message, modo)}</p>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-tinta-media">
        <span title={formatDateTime(alerta.occurredAt)}>
          Ocurrió {formatRelative(alerta.occurredAt)}
        </span>
        <SoloAvanzado>
          {alerta.ledger !== null && <span className="cifras">ledger {alerta.ledger}</span>}
          {alerta.txHash && <EnlaceTx txHash={alerta.txHash} explorerUrl={alerta.explorerUrl} />}
        </SoloAvanzado>
      </p>

      {pendiente && (
        <footer className="mt-2.5 flex flex-wrap justify-end gap-2 border-t border-linea pt-2">
          <Button variante="fantasma" tamano="sm" disabled={ocupada} onClick={onConfirmar}>
            <IconCheck className="h-3.5 w-3.5" />
            Sí, fui yo
          </Button>
          <Button variante="peligro" tamano="sm" disabled={ocupada} onClick={onReportar}>
            <IconBloqueo className="h-3.5 w-3.5" />
            No, no fui yo
          </Button>
        </footer>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmacion de reportar                                           */
/* ------------------------------------------------------------------ */

function ModalReportar({
  alerta,
  abierto,
  onClose,
  onConfirmar,
  ocupado,
  paso,
}: {
  alerta: Alert | null
  abierto: boolean
  onClose: () => void
  onConfirmar: () => void
  ocupado: boolean
  paso: 1 | 2
}) {
  const t = useTexto()
  return (
    <Modal
      abierto={abierto}
      onClose={onClose}
      titulo={paso === 1 ? '¿No fuiste tú?' : 'Confirmación final'}
      descripcion="Esto no se puede deshacer."
      pie={
        paso === 1 ? (
          <>
            <Button variante="fantasma" onClick={onClose} disabled={ocupado}>
              Cancelar
            </Button>
            <Button variante="peligro" onClick={onConfirmar}>
              Entiendo, seguir
            </Button>
          </>
        ) : (
          <>
            <Button variante="fantasma" onClick={onClose} disabled={ocupado}>
              Me he arrepentido
            </Button>
            <Button variante="peligro" onClick={onConfirmar} cargando={ocupado}>
              {t('reportarBoton')}
            </Button>
          </>
        )
      }
    >
      {paso === 1 ? (
        <div className="flex flex-col gap-2 text-sm text-tinta">
          <p>
            Has confirmado que no reconoces{' '}
            <span className="font-semibold">
              <Monto amount={alerta?.amount} asset={alerta?.asset ?? 'USDC'} />
            </span>
            <SoloAvanzado>
              {' '}
              hacia <span className="font-mono">{alerta?.destinationAddress ?? '—'}</span>
            </SoloAvanzado>
            .
          </p>
          <p className="text-tinta-media">
            Al reportarlo pasa lo siguiente, y es irreversible:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-tinta-media">
            <li>{t('reportar1')}</li>
            <li>{t('reportar2')}</li>
            <li>{t('reportar3')}</li>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-tinta">
          <p>{t('reportarFinal')}</p>
          <p className="text-tinta-media">{t('reportarFinalNota')}</p>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Resultado de reportar                                              */
/* ------------------------------------------------------------------ */

/** Al reportar, el backend responde con lo que el usuario tiene que hacer. */
function AvisoRotacion({ siguiente, version }: { siguiente: string; version: number }) {
  const modo = useModo()
  const t = useTexto()
  return (
    <p className="rounded-control border border-aviso/30 bg-aviso-50 px-3 py-2 text-xs text-aviso">
      {modo === 'avanzado' ? (
        <>
          {t('reportarHecho')} <span className="cifras font-semibold">{version}</span>.{' '}
          {siguiente}
        </>
      ) : (
        // El siguiente paso lo redacta el backend con jerga (llave, mandato):
        // en Simple se dice solo lo que pasó.
        t('reportarHecho')
      )}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                            */
/* ------------------------------------------------------------------ */

/** Filtros de la lista. Las palabras siguen el modo (ver `@/modo/textos`). */
function filtros(modo: Modo): { valor: AlertStatus | null; texto: string }[] {
  const simple = modo === 'simple'
  return [
    { valor: 'PENDIENTE', texto: ESTADO_ALERTA.PENDIENTE[modo] },
    { valor: null, texto: simple ? 'Todos' : 'Todas' },
    { valor: 'RECONOCIDA', texto: simple ? 'Fuiste tú' : 'Reconocidas' },
    { valor: 'REPORTADA', texto: simple ? 'Reportados' : 'Reportadas' },
  ]
}

const TAMANO = 10

export function AlertasPage() {
  const [filtro, setFiltro] = useState<AlertStatus | null>('PENDIENTE')
  const [pagina, setPagina] = useState(0)
  const [aReportar, setAReportar] = useState<Alert | null>(null)
  const [paso, setPaso] = useState<1 | 2>(1)
  const [rotacion, setRotacion] = useState<{ siguiente: string; version: number } | null>(null)

  const confirmar = useConfirm()
  const confirmarAlerta = useConfirmarAlerta()
  const reportar = useReportarAlerta()
  const { data: mandato } = useMandatoActivo()
  const modo = useModo()
  const t = useTexto()

  const { data, isPending, isError, error, refetch } = useAlertas(filtro, pagina, TAMANO)

  const total = data?.totalItems ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO))
  const ocupada = confirmarAlerta.isPending || reportar.isPending

  async function reconocer(alerta: Alert) {
    const ok = await confirmar.confirmar({
      titulo: '¿Reconoces este movimiento?',
      mensaje: t('alertaReconocerMsg'),
      textoConfirmar: 'Sí, fui yo',
      peligro: false,
    })
    if (!ok) return
    try {
      await confirmarAlerta.mutateAsync(alerta.id)
    } catch (err) {
      confirmar.error(t('alertaCerrarError'), errorMessage(err))
    }
  }

  function abrirReporte(alerta: Alert) {
    setAReportar(alerta)
    setPaso(1)
    setRotacion(null)
  }

  async function confirmarReporte() {
    if (paso === 1) {
      setPaso(2)
      return
    }
    if (!aReportar) return
    try {
      const r = await reportar.mutateAsync(aReportar.id)
      setRotacion({ siguiente: r.nextStep, version: r.newKeyVersion })
      setAReportar(null)
      setPaso(1)
    } catch (err) {
      confirmar.error('No se pudo reportar', errorMessage(err))
    }
  }

  return (
    <div className="contenedor py-6">
      <header className="pagina-cabecera">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-tinta">{t('tituloAlertas')}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">{t('alertasDesc')}</p>
          </div>

          <Select
            value={filtro ?? ''}
            aria-label={t('alertasFiltrar')}
            onChange={(e) => {
              setFiltro(e.target.value === '' ? null : (e.target.value as AlertStatus))
              setPagina(0)
              setRotacion(null)
            }}
          >
            {filtros(modo).map((f) => (
              <option key={f.texto} value={f.valor ?? ''}>
                {f.texto}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {rotacion && (
        <div className="mt-4">
          <AvisoRotacion siguiente={rotacion.siguiente} version={rotacion.version} />
        </div>
      )}

      {mandato && total > 0 && filtro === 'PENDIENTE' && (
        <p className="mt-3 text-2xs text-tinta-media">
          {t('alertasSigueActivo')}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {isPending && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-28" />)}

        {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

        {!isPending && !isError && total === 0 && (
          <EmptyState
            icono={<IconAlertaMovimiento className="h-5 w-5" />}
            titulo={filtro === 'PENDIENTE' ? 'Ningún movimiento raro' : t('alertasFiltroTitulo')}
            descripcion={
              filtro === 'PENDIENTE'
                ? 'Todo lo que ha salido de tu cuenta se ha pedido desde el chat. Aquí aparecería cualquier otra cosa.'
                : t('alertasFiltroDesc')
            }
          />
        )}

        {data?.items.map((alerta) => (
          <Fila
            key={alerta.id}
            alerta={alerta}
            ocupada={ocupada}
            onConfirmar={() => void reconocer(alerta)}
            onReportar={() => abrirReporte(alerta)}
          />
        ))}
      </div>

      {total > TAMANO && (
        <div className="mt-4">
          <Pagination
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalElementos={total}
            sustantivo={t('alertasSustantivo')}
            onChange={setPagina}
          />
        </div>
      )}

      <ModalReportar
        alerta={aReportar}
        abierto={aReportar !== null}
        onClose={() => {
          setAReportar(null)
          setPaso(1)
        }}
        onConfirmar={() => void confirmarReporte()}
        ocupado={reportar.isPending}
        paso={paso}
      />
    </div>
  )
}

