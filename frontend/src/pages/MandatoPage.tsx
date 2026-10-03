/**
 * Mandato: el permiso que le das al agente.
 *
 * Es la pantalla donde el usuario decide cuánta autonomía cede. Por eso todo
 * lo que hay aquí está expresado como una promesa legible ("hasta 300 USDC al
 * día, nunca más de 90 en un pago") y no como campos sueltos.
 *
 * Los tres topes tienen una relación obligatoria, y la interfaz la pide antes
 * que el backend:
 *
 *     umbral de aprobacion  <=  tope por pago  <=  tope diario
 *
 * El umbral es el punto a partir del cual el agente pregunta. Si fuera mayor
 * que el tope por pago, el agente nunca podría pagar ese tope sin preguntar, y
 * la promesa "hasta 90 sin preguntar" sería una mentira.
 *
 * La creación necesita datos de una transacción ya ejecutada en la cadena
 * (hash, regla de contexto, ledger válido). El panel no despliega ni firma:
 * muestra la llave pública que hay que autorizar y espera que el usuario
 * pegue el hash de lo que él hizo fuera. Si el panel fabricara ese hash, la
 * prueba de autorización no probaría nada.
 */

import { useState, type FormEvent } from 'react'

import {
  Button,
  ErrorState,
  Field,
  Input,
  Module,
  ModuleHeader,
  Select,
  Skeleton,
  StellarAddress,
} from '@/components/ui'
import { IconMandato, IconRefrescar } from '@/components/icons'
import { GastoBar, MandateStatusBadge, Monto } from '@/components/domain'
import { EnlaceTx } from '@/components/Propuesta'
import { useConfirm } from '@/hooks/useConfirm'
import { useCopy } from '@/hooks'
import { MOCK_ENABLED } from '@/config/env'
import {
  errorMessage,
  useCrearMandato,
  useHealth,
  useLimites,
  useLlaveAgente,
  useMandatoActivo,
  useRevocarMandato,
} from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { formatDateTime, formatRelative } from '@/lib/format'
import { SoloAvanzado } from '@/modo'
import { etiquetaActivoEnTexto, texto, type Modo } from '@/modo/textos'
import { useEtiquetaActivo, useModo, useTexto } from '@/modo/useModo'
import type { Mandate } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Datos de un mandato                                                */
/* ------------------------------------------------------------------ */

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs text-tinta-media">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-tinta">{children}</dd>
    </div>
  )
}

function BotonCopiar({ valor }: { valor: string }) {
  const { copiado, copiar } = useCopy(valor)
  return (
    <button
      type="button"
      onClick={() => void copiar()}
      className="text-2xs font-medium text-acento underline underline-offset-2 hover:no-underline"
    >
      {copiado ? 'Copiada' : 'Copiar'}
    </button>
  )
}

/** `datetime-local` espera hora local; `toISOString` daría UTC y desplazaría la fecha. */
function aFechaLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function enDias(dias: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d
}

/** El backend rechaza más de 30 días: se propone 29 para no rozar el límite. */
function caducidadPorDefecto(): string {
  return aFechaLocal(enDias(29))
}

function hashDePrueba(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Los tres topes se comparan como `Number` porque hay que decidir el orden,
 * pero se conservan como `string` para mandarlos tal cual. La representación
 * en pantalla la hace `Intl` a partir del string, no de un float ya redondeado.
 */
function topesCoherentes(
  umbral: number,
  porPago: number,
  diario: number,
  modo: Modo,
): string | null {
  if (!(umbral > 0)) return texto('topeUmbralCero', modo)
  if (umbral > porPago) return texto('topeUmbralMayor', modo)
  if (porPago > diario) return texto('topePorPagoMayor', modo)
  return null
}

/* ------------------------------------------------------------------ */
/* Crear mandato                                                      */
/* ------------------------------------------------------------------ */

function FormularioNuevoMandato() {
  const crear = useCrearMandato()
  const { data: llave, refetch: releerLlave, isPending: cargandoLlave } = useLlaveAgente()
  const { data: salud } = useHealth()
  const firmanteSimulado = MOCK_ENABLED || salud?.signerMode === 'mock'
  const modo = useModo()
  const t = useTexto()
  const activo = useEtiquetaActivo()

  // Topes de partida. Se quedan por debajo del tope diario on-chain del
  // contrato (50 USDC en el firmante simulado, `onchain-daily-limit`): si el
  // prefill fuera de 300/90, la cuarta capa frenaría antes que el mandato y el
  // usuario vería pagos rechazados por la cadena sin saber por qué.
  const [diario, setDiario] = useState('45')
  const [porPago, setPorPago] = useState('25')
  const [umbral, setUmbral] = useState('10')
  const [caduca, setCaduca] = useState(caducidadPorDefecto)
  const [regla, setRegla] = useState('1')
  const [ledger, setLedger] = useState('1000000')
  const [hash, setHash] = useState('')

  const problema = topesCoherentes(Number(umbral), Number(porPago), Number(diario), modo)
  const faltaHash = hash.trim() === ''
  const sinLlave = !llave

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (problema || faltaHash || sinLlave) return
    await crear.mutateAsync({
      dailyLimit: diario.trim(),
      perTxLimit: porPago.trim(),
      approvalThreshold: umbral.trim(),
      asset: 'USDC',
      expiresAt: new Date(caduca).toISOString(),
      contextRuleId: Number(regla),
      validUntilLedger: Number(ledger),
      createTxHash: hash.trim(),
      keyVersion: llave.keyVersion,
      agentPublicKeyHex: llave.publicKeyHex,
    })
  }

  return (
    <Module>
      <ModuleHeader titulo={t('reglasCrear')} descripcion={t('reglasCrearDesc')} />

      <form onSubmit={enviar} className="modulo-cuerpo flex flex-col gap-5">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-2xs font-semibold uppercase tracking-wide text-tinta-media">
            {t('reglasLeyendaTopes')}
          </legend>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Te pregunta a partir de"
              ayuda="Por debajo de esto paga solo."
              requerido
              error={problema}
            >
              {(props) => (
                <Input
                  {...props}
                  value={umbral}
                  inputMode="decimal"
                  className="cifras"
                  onChange={(e) => setUmbral(e.target.value)}
                />
              )}
            </Field>

            <Field label="Nunca más de, en un pago" requerido>
              {(props) => (
                <Input
                  {...props}
                  value={porPago}
                  inputMode="decimal"
                  className="cifras"
                  onChange={(e) => setPorPago(e.target.value)}
                />
              )}
            </Field>

            <Field label="Al día, como máximo" ayuda="Suma de 24 h, no de día natural." requerido>
              {(props) => (
                <Input
                  {...props}
                  value={diario}
                  inputMode="decimal"
                  className="cifras"
                  onChange={(e) => setDiario(e.target.value)}
                />
              )}
            </Field>
          </div>

          {problema ? (
            <p className="text-2xs text-aviso">{problema}</p>
          ) : (
            <p className="text-2xs text-tinta-media">
              {modo === 'avanzado' ? 'Traducción: el agente' : 'En resumen: tu asistente'} paga
              solo hasta{' '}
              <span className="cifras font-medium text-tinta">
                {umbral} {activo('USDC')}
              </span>
              , nunca pasa de{' '}
              <span className="cifras font-medium text-tinta">
                {porPago} {activo('USDC')}
              </span>{' '}
              por pago, y en total no gasta más de{' '}
              <span className="cifras font-medium text-tinta">
                {diario} {activo('USDC')}
              </span>{' '}
              en 24 horas. {t('reglasPorEncima')}
            </p>
          )}

          <SoloAvanzado>
            <p className="text-2xs text-tinta-media">
              Estos tres topes son los tuyos. Por debajo hay un cuarto, del contrato
              inteligente, que no se puede subir desde aquí: si lo alcanzaras, el
              pago pararía en la cadena aunque el mandato lo permita.
            </p>
          </SoloAvanzado>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hasta cuándo" ayuda="Como mucho 30 días. Pasado ese momento, el agente se para solo." requerido>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={caduca}
                min={aFechaLocal(new Date())}
                max={aFechaLocal(enDias(30))}
                onChange={(e) => setCaduca(e.target.value)}
              />
            )}
          </Field>

          {/* Campo fijo (siempre USDC): informativo, por eso solo en Avanzado. */}
          <SoloAvanzado>
            <Field label="Activo" ayuda="El MVP solo mueve USDC." requerido>
              {(props) => (
                <Select {...props} value="USDC" disabled>
                  <option value="USDC">USDC</option>
                </Select>
              )}
            </Field>
          </SoloAvanzado>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-control border border-linea p-3">
          <legend className="px-1 text-2xs font-semibold uppercase tracking-wide text-tinta-media">
            {/* Los campos de abajo son obligatorios para crear el mandato:
                en Simple no se ocultan, solo cambia el título. */}
            {t('reglasLeyendaTecnica')}
          </legend>

          <div className="rounded-control bg-superficie-2 p-2.5">
            {llave ? (
              <>
                <p className="text-2xs text-tinta-media">
                  Autoriza esta llave en el contrato y luego pega aquí el hash de esa
                  transacción:
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-2xs text-tinta">{llave.publicKeyHex}</span>
                  <BotonCopiar valor={llave.publicKeyHex} />
                  <span className="text-2xs text-tinta-media">
                    versión de llave <span className="cifras">{llave.keyVersion}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <StellarAddress publicKey={llave.address} etiqueta="Agente" />
                </div>
              </>
            ) : (
              <p className="text-2xs text-tinta-media">
                {cargandoLlave
                  ? 'Leyendo la llave del agente…'
                  : 'No se ha podido leer la llave del agente. Revisa que tu smart account esté registrada.'}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ID de la regla" requerido ayuda="El número del contexto.">
              {(props) => (
                <Input
                  {...props}
                  value={regla}
                  inputMode="numeric"
                  className="cifras"
                  onChange={(e) => setRegla(e.target.value)}
                />
              )}
            </Field>

            <Field label="Ledger válido" requerido ayuda="Hasta qué ledger vale.">
              {(props) => (
                <Input
                  {...props}
                  value={ledger}
                  inputMode="numeric"
                  className="cifras"
                  onChange={(e) => setLedger(e.target.value)}
                />
              )}
            </Field>

            <Field
              label="Hash de la creación"
              requerido
              ayuda="La prueba de que la autorizaste tú."
              error={faltaHash ? 'Falta pegar el hash de la transacción.' : null}
            >
              {(props) => (
                <Input
                  {...props}
                  value={hash}
                  spellCheck={false}
                  placeholder={firmanteSimulado ? 'hash de prueba' : 'a1b2…'}
                  className="mono"
                  onChange={(e) => setHash(e.target.value.trim())}
                />
              )}
            </Field>
          </div>

          {firmanteSimulado && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-superficie-2 p-2.5">
              <p className="min-w-0 flex-1 text-2xs text-tinta-media">
                El firmante es simulado: no hay transacción real que autorizar. Usa un hash de
                prueba para la demo.
              </p>
              <Button variante="secundario" tamano="sm" type="button" onClick={() => setHash(hashDePrueba())}>
                Usar hash de prueba
              </Button>
            </div>
          )}
        </fieldset>

        {crear.isError && (
          <p role="alert" className="text-xs text-error">
            {errorMessage(crear.error)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variante="primario"
            cargando={crear.isPending}
            disabled={Boolean(problema) || faltaHash || sinLlave}
          >
            {t('reglasGuardar')}
          </Button>
          <Button
            variante="fantasma"
            type="button"
            cargando={cargandoLlave}
            onClick={() => void releerLlave()}
          >
            <IconRefrescar className="h-4 w-4" />
            Releer la llave
          </Button>
        </div>

        <p className="text-2xs text-tinta-media">
          Nexora no puede firmar esta transacción por ti, y por eso no inventa el hash: es la
          prueba de que la autorizaste fuera de aquí.
        </p>
      </form>
    </Module>
  )
}

/* ------------------------------------------------------------------ */
/* Mandato vigente                                                   */
/* ------------------------------------------------------------------ */

function DetalleMandato({ mandato }: { mandato: Mandate }) {
  const revocar = useRevocarMandato()
  const confirmar = useConfirm()
  const { data: limites } = useLimites()
  const t = useTexto()
  const modo = useModo()

  async function revocarAhora() {
    const ok = await confirmar.confirmar({
      titulo: t('reglasPausarTitulo'),
      mensaje: t('reglasPausarMsg'),
      textoConfirmar: t('reglasPausarConfirmar'),
    })
    if (!ok) return
    try {
      await revocar.mutateAsync({ id: mandato.id })
    } catch (err) {
      confirmar.error(t('reglasPausarError'), errorMessage(err))
    }
  }

  return (
    <Module>
      <ModuleHeader
        titulo={t('reglasVigente')}
        descripcion={etiquetaActivoEnTexto(mandato.summary, modo)}
        acciones={<MandateStatusBadge status={mandato.status} />}
      />

      <div className="modulo-cuerpo grid gap-5 sm:grid-cols-2">
        <dl className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Te pregunta a partir de">
            <Monto amount={mandato.approvalThreshold} asset={mandato.asset} />
          </Dato>
          <Dato etiqueta="Nunca más por pago">
            <Monto amount={mandato.perTxLimit} asset={mandato.asset} />
          </Dato>
          <Dato etiqueta="Máximo al día">
            <Monto amount={mandato.dailyLimit} asset={mandato.asset} />
          </Dato>
          <Dato etiqueta="Caduca">
            <span title={formatDateTime(mandato.expiresAt)}>
              {formatRelative(mandato.expiresAt)}
            </span>
          </Dato>
          <SoloAvanzado>
            <Dato etiqueta="Versión de llave">
              <span className="cifras">{mandato.keyVersion}</span>
            </Dato>
            <Dato etiqueta="Regla de contexto">
              <span className="cifras">#{mandato.contextRuleId}</span>
            </Dato>
          </SoloAvanzado>
        </dl>

        <div className="flex flex-col gap-3">
          <GastoBar
            gastado={limites?.spentLast24h ?? '0'}
            diario={mandato.dailyLimit}
            umbral={mandato.approvalThreshold}
          />

          <SoloAvanzado>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {mandato.createTxHash && (
                <EnlaceTx
                  txHash={mandato.createTxHash}
                  texto="Ver la autorización en la red"
                />
              )}
              {mandato.revokeTxHash && <EnlaceTx txHash={mandato.revokeTxHash} texto="Ver la revocación" />}
            </div>
          </SoloAvanzado>

          {mandato.revokeReason && (
            <p className="text-2xs text-tinta-media">
              {t('reglasPausadasPor')}{' '}
              <span className="font-medium">
                {mandato.revokeReason === 'USUARIO' ? 'ti' : t('reglasPorAviso')}
              </span>
              {mandato.revokedAt ? ` · ${formatRelative(mandato.revokedAt)}` : ''}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-2xs text-tinta-media">{t('reglasCambiar')}</p>
            <div>
              <Button
                variante="peligro"
                tamano="sm"
                cargando={revocar.isPending}
                onClick={() => void revocarAhora()}
              >
                {t('reglasPausar')}
              </Button>
            </div>
          </div>

          {revocar.isError && (
            <p role="alert" className="text-2xs text-error">
              {errorMessage(revocar.error)}
            </p>
          )}
        </div>
      </div>
    </Module>
  )
}

/* ------------------------------------------------------------------ */
/* Página                                                            */
/* ------------------------------------------------------------------ */

export function MandatoPage() {
  const { account } = useSesion()
  const { data: mandato, isPending, isError, error, refetch } = useMandatoActivo()

  const activo = mandato?.status === 'ACTIVO'
  const t = useTexto()

  return (
    <div className="contenedor flex flex-col gap-4 py-6">
      <header>
        <h2 className="text-base font-semibold tracking-tight text-tinta">{t('tituloReglas')}</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-tinta-media">{t('reglasDesc')}</p>
      </header>

      {!account && (
        <p role="alert" className="text-sm text-error">
          {t('reglasSinCuenta')}
        </p>
      )}

      {isPending && <Skeleton className="h-44" />}

      {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

      {!isPending && !isError && account && activo && <DetalleMandato mandato={mandato} />}

      {!isPending && !isError && account && !activo && (
        <>
          <p className="flex items-start gap-1.5 text-sm text-tinta-media">
            <IconMandato className="mt-0.5 h-4 w-4 shrink-0 text-tinta-media" />
            <span>{t('reglasSinMandato')}</span>
          </p>
          <FormularioNuevoMandato />
        </>
      )}
    </div>
  )
}
