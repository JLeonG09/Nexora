/**
 * Primeros pasos: se configura el asistente antes de abrir el chat.
 *
 * Cuatro pasos, uno por pantalla y sin menu alrededor: que hace el asistente,
 * como se quiere ver la app, a quien se le puede pagar y cuanto puede pagar
 * solo. Al terminar se marca como hecho en el navegador y se abre el chat.
 *
 * Contactos y reglas se pueden dejar para despues: no se bloquea a nadie,
 * pero sin reglas el asistente no puede pagar y se le dice claramente.
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import { useIsMutating } from '@tanstack/react-query'

import { PanelAccesibilidad, useAccesibilidad } from '@/accesibilidad'
import {
  errorMessage,
  useContactos,
  useCrearContacto,
  useCrearMandato,
  useHealth,
  useLlaveAgente,
  useMandatoActivo,
} from '@/api/queries'
import { Button, Field, Input, Spinner } from '@/components/ui'
import { IconCheck, LogoNexora } from '@/components/icons'
import { MOCK_ENABLED } from '@/config/env'
import { cn } from '@/lib/cn'
import { isValidPublicKey, publicKeyError } from '@/lib/stellar'
import { useSesion } from '@/sesion/SesionContext'

const PASOS = ['Bienvenida', 'Cómo ver la app', 'Tu contacto de confianza', 'Reglas del asistente'] as const

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const HEX = '0123456789abcdef'

function aleatorio(alfabeto: string, largo: number): string {
  return Array.from({ length: largo }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join('')
}

/** Solo con el firmante simulado: con uno real el pago fallaria en la red. */
function usaFirmanteSimulado(signerMode?: string): boolean {
  return MOCK_ENABLED || signerMode === 'mock'
}

/* ------------------------------------------------------------------ */
/* Estructura                                                         */
/* ------------------------------------------------------------------ */

function Progreso({ actual }: { actual: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Paso ${actual + 1} de ${PASOS.length}`}>
      {PASOS.map((nombre, i) => (
        <li
          key={nombre}
          title={nombre}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-all duration-500',
            i <= actual
              ? 'bg-gradient-to-r from-oro to-oro-claro shadow-[0_0_10px_rgb(224_166_58/0.45)]'
              : 'bg-filete',
          )}
        />
      ))}
    </ol>
  )
}

function Paso({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="emerger space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">{titulo}</h1>
        {descripcion && <p className="text-lg text-tinta-media">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

function YaHecho({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-card border border-ok/30 bg-ok-50 px-5 py-4 text-lg text-ok">
      <IconCheck className="mt-1 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 1: bienvenida                                                 */
/* ------------------------------------------------------------------ */

function PasoBienvenida({ nombre }: { nombre: string }) {
  const puntos = [
    'Tú me escribes a quién quieres pagar y cuánto, como se lo dirías a una persona.',
    'Solo pago a las personas que tú agregues como contactos.',
    'Si el pago es grande, te pido permiso antes de hacerlo.',
  ]
  return (
    <section className="space-y-8">
      <span className="orbe block" aria-hidden="true" />
      <div className="emerger space-y-3" style={{ '--orden': 1 } as React.CSSProperties}>
        <h1 className="text-3xl font-semibold tracking-tight text-tinta sm:text-4xl">
          Hola{nombre && (
            <>
              , {nombre}
            </>
          )}
          .<br />Soy tu asistente de pagos.
        </h1>
        <p className="text-lg text-tinta-media">
          Antes de empezar, vamos a dejar todo listo en cuatro pasos cortos.
        </p>
      </div>
      <ul className="space-y-3">
        {puntos.map((p, i) => (
          <li
            key={p}
            className="emerger elevada flex items-start gap-3 rounded-card px-5 py-4 text-lg text-tinta"
            style={{ '--orden': i + 2 } as React.CSSProperties}
          >
            <IconCheck className="mt-1 h-5 w-5 shrink-0 text-oro-claro" />
            {p}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 3: contacto de confianza                                      */
/* ------------------------------------------------------------------ */

function PasoContacto({ onListo }: { onListo: () => void }) {
  const { data: contactos, isPending } = useContactos()
  const { data: salud } = useHealth()
  const crear = useCrearContacto()
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tocado, setTocado] = useState(false)

  const dir = direccion.trim()
  const valido = nombre.trim() !== '' && isValidPublicKey(dir)

  const tiene = (contactos?.length ?? 0) > 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (tiene && nombre.trim() === '' && dir === '') return onListo()
    setTocado(true)
    if (!valido) return
    await crear.mutateAsync({ name: nombre.trim(), stellarAddress: dir })
    onListo()
  }

  if (isPending) return <Spinner className="h-6 w-6 text-tinta-media" />

  return (
    <Paso
      titulo="¿A quién le vas a pagar?"
      descripcion="Agrega a una persona de confianza. Solo podré pagar a quien esté en tus contactos."
    >
      {tiene && (
        <YaHecho>
          Ya tienes {contactos!.length === 1 ? 'un contacto' : `${contactos!.length} contactos`}:{' '}
          {contactos!.map((c) => c.name).join(', ')}. Puedes seguir o agregar otro.
        </YaHecho>
      )}

      <form id="form-contacto" onSubmit={guardar} className="space-y-4">
        <Field
          label="Nombre"
          ayuda="Como lo dirías en el chat. Por ejemplo: María, mi hijo Carlos."
          error={tocado && nombre.trim() === '' ? 'Escribe un nombre.' : null}
        >
          {(props) => (
            <Input {...props} value={nombre} placeholder="María" onChange={(e) => setNombre(e.target.value)} />
          )}
        </Field>

        <Field
          label="Dirección de su billetera"
          ayuda="Pídesela a esa persona. Empieza con G y tiene 56 caracteres."
          error={tocado && dir !== '' ? publicKeyError(dir) : tocado ? 'Falta la dirección.' : null}
        >
          {(props) => (
            <Input
              {...props}
              value={direccion}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="G…"
              className="mono"
              onChange={(e) => setDireccion(e.target.value.trim())}
            />
          )}
        </Field>

        {usaFirmanteSimulado(salud?.signerMode) && !isValidPublicKey(dir) && (
          <Button variante="secundario" tamano="sm" onClick={() => setDireccion(`G${aleatorio(BASE32, 55)}`)}>
            Usar una dirección de prueba
          </Button>
        )}

        {crear.isError && (
          <p role="alert" className="text-base text-error">
            {errorMessage(crear.error)}
          </p>
        )}
      </form>
    </Paso>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 4: reglas del asistente                                       */
/* ------------------------------------------------------------------ */

function CampoMonto({
  label,
  ayuda,
  valor,
  onChange,
}: {
  label: string
  ayuda: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label} ayuda={ayuda}>
      {(props) => (
        <div className="flex items-center gap-2">
          <Input
            {...props}
            value={valor}
            inputMode="decimal"
            className="cifras max-w-40"
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="text-lg text-tinta-media">dólares</span>
        </div>
      )}
    </Field>
  )
}

function PasoReglas({ onListo }: { onListo: () => void }) {
  const { data: mandato, isPending } = useMandatoActivo()
  const { data: salud } = useHealth()
  const { data: llave } = useLlaveAgente()
  const crear = useCrearMandato()

  // Por debajo del tope diario on-chain del firmante simulado (50 USDC).
  const [umbral, setUmbral] = useState('10')
  const [porPago, setPorPago] = useState('25')
  const [diario, setDiario] = useState('45')

  const u = Number(umbral)
  const p = Number(porPago)
  const d = Number(diario)
  const problema = !(u > 0)
    ? 'El primer monto tiene que ser mayor que cero.'
    : u > p
      ? 'Lo que pago solo no puede ser mayor que el máximo por pago.'
      : p > d
        ? 'El máximo por pago no puede ser mayor que el máximo del día.'
        : null

  const simulado = usaFirmanteSimulado(salud?.signerMode)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (problema || !llave) return
    const caduca = new Date()
    caduca.setDate(caduca.getDate() + 30)
    await crear.mutateAsync({
      dailyLimit: diario.trim(),
      perTxLimit: porPago.trim(),
      approvalThreshold: umbral.trim(),
      asset: 'USDC',
      expiresAt: caduca.toISOString(),
      contextRuleId: 1,
      validUntilLedger: 1_000_000,
      createTxHash: aleatorio(HEX, 64),
      keyVersion: llave.keyVersion,
      agentPublicKeyHex: llave.publicKeyHex,
    })
    onListo()
  }

  if (isPending) return <Spinner className="h-6 w-6 text-tinta-media" />

  if (mandato) {
    return (
      <Paso titulo="Tus reglas ya están listas">
        <YaHecho>{mandato.summary}</YaHecho>
        <p className="text-base text-tinta-media">Puedes cambiarlas cuando quieras en «Mis reglas de pago».</p>
      </Paso>
    )
  }

  if (!simulado) {
    return (
      <Paso
        titulo="¿Cuánto puedo pagar por ti?"
        descripcion="Para darme permiso en la red real hace falta firmar una autorización con tu billetera."
      >
        <p className="text-lg text-tinta">
          Lo puedes hacer después, con ayuda, desde «Mis reglas de pago». Mientras tanto podré
          conversar contigo, pero no hacer pagos.
        </p>
      </Paso>
    )
  }

  return (
    <Paso
      titulo="¿Cuánto puedo pagar por ti?"
      descripcion="Tú pones los límites. Nunca los pasaré, y podrás cambiarlos cuando quieras."
    >
      <form id="form-reglas" onSubmit={guardar} className="space-y-5">
        <CampoMonto
          label="Puedo pagar solo, sin preguntarte, hasta"
          ayuda="Si un pago es mayor, te pido permiso antes."
          valor={umbral}
          onChange={setUmbral}
        />
        <CampoMonto
          label="Nunca más de esto en un solo pago"
          ayuda="Aunque me des permiso, no pasaré de aquí."
          valor={porPago}
          onChange={setPorPago}
        />
        <CampoMonto
          label="En total, como máximo al día"
          ayuda="Sumando todos los pagos de las últimas 24 horas."
          valor={diario}
          onChange={setDiario}
        />

        {problema && <p className="text-base text-aviso">{problema}</p>}
        {crear.isError && (
          <p role="alert" className="text-base text-error">
            {errorMessage(crear.error)}
          </p>
        )}
        <p className="text-sm text-tinta-media">
          Modo de prueba: la autorización se simula y no se mueve dinero real. Las reglas duran 30 días.
        </p>
      </form>
    </Paso>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                             */
/* ------------------------------------------------------------------ */

export function PrimerosPasosPage() {
  const { user } = useSesion()
  const { marcarPrimerosPasos } = useAccesibilidad()
  const { data: mandato } = useMandatoActivo()
  const { data: salud } = useHealth()
  const guardando = useIsMutating() > 0
  const [paso, setPaso] = useState(0)

  const nombre = user?.displayName.trim().split(/\s+/)[0] ?? ''
  const ultimo = paso === PASOS.length - 1

  function terminar() {
    if (user) marcarPrimerosPasos(user.id, true)
  }

  const siguiente = () => (ultimo ? terminar() : setPaso((p) => p + 1))

  // En los pasos con formulario, "Siguiente" envia el formulario; el propio
  // paso avanza al guardar. Si ya hay mandato, no hay formulario de reglas.
  const formulario =
    paso === 2 ? 'form-contacto' : paso === 3 && !mandato && usaFirmanteSimulado(salud?.signerMode) ? 'form-reglas' : null

  return (
    <div className="acceso flex min-h-dvh bg-fondo flex-col text-tinta">
      <header className="contenedor flex max-w-2xl items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-2.5">
          <LogoNexora alto={28} />
          <span className="text-lg font-semibold">Nexora</span>
        </div>
        <span className="text-base text-tinta-media">
          Paso {paso + 1} de {PASOS.length}
        </span>
      </header>

      <div className="contenedor max-w-2xl">
        <Progreso actual={paso} />
      </div>

      <main key={paso} className="contenedor flex max-w-2xl flex-1 flex-col py-10">
        {paso === 0 && <PasoBienvenida nombre={nombre} />}
        {paso === 1 && (
          <Paso titulo="¿Cómo quieres ver la aplicación?" descripcion="Los cambios se ven al momento. Puedes cambiarlos después en «Accesibilidad».">
            <PanelAccesibilidad />
          </Paso>
        )}
        {paso === 2 && <PasoContacto onListo={siguiente} />}
        {paso === 3 && <PasoReglas onListo={siguiente} />}
      </main>

      <footer className="sticky bottom-0 border-t border-filete bg-fondo/80 shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.35)] backdrop-blur-md">
        <div className="contenedor flex max-w-2xl items-center justify-between gap-3 py-4">
          {paso > 0 ? (
            <Button variante="fantasma" onClick={() => setPaso((p) => p - 1)}>
              Atrás
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {formulario && (
              <Button variante="fantasma" onClick={siguiente}>
                Lo hago después
              </Button>
            )}
            {/* La `key` fuerza un boton nuevo al cambiar de paso: si React
                reutilizara el mismo, el clic de "Siguiente" que lo convierte
                en `submit` enviaria el formulario del paso siguiente. */}
            <Button
              key={`${paso}-${formulario ?? 'avanzar'}`}
              variante="primario"
              type={formulario ? 'submit' : 'button'}
              form={formulario ?? undefined}
              onClick={formulario ? undefined : siguiente}
              cargando={guardando}
            >
              {paso === 0
                ? 'Empezar'
                : ultimo
                  ? formulario
                    ? 'Guardar y abrir el chat'
                    : 'Abrir el chat'
                  : formulario
                    ? 'Guardar y seguir'
                    : 'Siguiente'}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
