/**
 * Acceso: entrar o crear cuenta, y despues registrar la smart account.
 *
 *  1. Identidad. `POST /api/users/login` recupera un usuario por su correo
 *     (simulado en el MVP: sin contrasena ni verificacion) y `POST /api/users`
 *     crea uno nuevo. Ambos devuelven el id que viaja en `X-User-Id`.
 *  2. `POST /api/accounts` REGISTRA una smart account que el usuario ya
 *     desplego por fuera. El panel no genera claves, no pide seed phrase y
 *     no firma nada. Si se perdiera la clave privada, el dinero tampoco
 *     estaria aqui, y eso es justo lo que hay que decir antes de empezar.
 *
 * `/entrar` y `/empezar` son la misma pantalla con la pestana cambiada, para
 * que cada boton de la landing lleve directo a lo que promete.
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Button, Exito, Field, Input, Spinner } from '@/components/ui'
import {
  IconAprobaciones,
  IconBloqueo,
  IconInfo,
  IconMandato,
  LogoNexora,
} from '@/components/icons'
import { ApiError } from '@/api/errors'
import { errorMessage, useHealth } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { MOCK_ENABLED, PRIVY_ENABLED } from '@/config/env'
import { AccesoPrivy } from '@/sesion/PrivyAuth'

export type ModoAcceso = 'entrar' | 'crear'

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mensaje del backend para un campo concreto, si lo hay. */
function errorDelCampo(err: unknown, campo: string): string | null {
  return err instanceof ApiError ? (err.fieldErrors[campo] ?? null) : null
}

/* ------------------------------------------------------------------ */
/* Direccion de prueba                                                */
/* ------------------------------------------------------------------ */

/** Alfabeto base32 de Stellar (RFC 4648 sin padding) para una `C...` valida. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Direccion de contrato ficticia pero CON FORMATO VALIDO.
 *
 * Solo se ofrece con datos simulados o con el firmante del backend en modo
 * mock (con uno real fallaria el primer pago), y esta marcada como tal. Existe
 * porque el alta exige una direccion real de 56 caracteres: sin ella nadie
 * puede recorrer la demo.
 */
function direccionDePrueba(): string {
  const cuerpo = Array.from({ length: 55 }, () => BASE32[Math.floor(Math.random() * 32)]).join('')
  return `C${cuerpo}`
}

/* ------------------------------------------------------------------ */
/* Estructura                                                         */
/* ------------------------------------------------------------------ */

export function AltaPage({ modo = 'crear' }: { modo?: ModoAcceso }) {
  const { user, cerrarSesion } = useSesion()

  return (
    <div className="acceso grid min-h-dvh bg-fondo text-tinta lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <PanelMarca />

      <main className="flex flex-col px-5 py-5 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 lg:invisible" aria-label="Nexora, inicio">
            <LogoNexora alto={30} />
            <span className="text-[1.25rem] font-semibold tracking-tight">Nexora</span>
          </Link>
          {user ? (
            <button
              type="button"
              onClick={cerrarSesion}
              className="min-h-11 px-2 text-[1rem] text-tinta-media underline underline-offset-4 hover:text-tinta"
            >
              Salir y usar otra cuenta
            </button>
          ) : (
            <Link
              to="/"
              className="flex min-h-11 items-center px-2 text-[1rem] text-tinta-media underline underline-offset-4 hover:text-tinta"
            >
              Volver al inicio
            </Link>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {user ? <PasoCuenta /> : <Acceso modo={modo} />}
        </div>
      </main>
    </div>
  )
}

/** Columna de marca: recuerda que se esta entrando y por que es seguro. */
function PanelMarca() {
  const garantias = [
    { icono: <IconBloqueo />, texto: 'Sin contraseñas largas ni frases secretas.' },
    { icono: <IconMandato />, texto: 'Topes de gasto que nadie puede saltarse.' },
    { icono: <IconAprobaciones />, texto: 'Los pagos grandes siempre te los pregunta.' },
  ]
  return (
    <aside className="hidden flex-col justify-between bg-fondo-cierre p-12 text-white lg:flex">
      <Link to="/" className="flex items-center gap-2.5 self-start" aria-label="Nexora, inicio">
        <LogoNexora alto={34} tono="claro" />
        <span className="text-[1.375rem] font-semibold tracking-tight">Nexora</span>
      </Link>

      <div>
        <p className="inline-flex items-center gap-2 text-[1rem] text-texto-cierre">
          <span className="h-2 w-2 rounded-full bg-led" aria-hidden="true" />
          Pagos sencillos y protegidos
        </p>
        <p className="mt-4 max-w-sm text-[2.25rem] font-semibold leading-[1.15] tracking-tight">
          Tú pones las riendas. El asistente hace el resto.
        </p>
        <ul className="mt-10 flex flex-col gap-5">
          {garantias.map((g) => (
            <li key={g.texto} className="flex items-center gap-3 text-[1.125rem] text-texto-cierre">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-white/15 text-white [&>svg]:h-5 [&>svg]:w-5">
                {g.icono}
              </span>
              {g.texto}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[0.9375rem] text-texto-cierre">
        Funciona sobre la red de pruebas de Stellar, con dinero de práctica.
      </p>
    </aside>
  )
}

function Encabezado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{titulo}</h1>
      <p className="mt-2 text-[1.125rem] leading-relaxed text-tinta-media">{children}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 1: entrar o crear cuenta                                      */
/* ------------------------------------------------------------------ */

function Acceso({ modo }: { modo: ModoAcceso }) {
  const entrar = modo === 'entrar'
  return (
    <>
      <nav aria-label="Elige cómo acceder" className="acceso-pestanas mb-8">
        <Link to="/entrar" replace aria-current={entrar ? 'page' : undefined}>
          Iniciar sesión
        </Link>
        <Link to="/empezar" replace aria-current={entrar ? undefined : 'page'}>
          Crear cuenta
        </Link>
      </nav>

      <div key={modo} className="acceso-entrada">
        {entrar ? (
          <Encabezado titulo="Hola de nuevo">Entra con el correo con el que creaste tu cuenta.</Encabezado>
        ) : (
          <Encabezado titulo="Crea tu cuenta">
            Solo tu nombre y tu correo. Toma menos de un minuto.
          </Encabezado>
        )}

        {PRIVY_ENABLED ? (
          <AccesoPrivy textoBoton={entrar ? 'Iniciar sesión' : 'Crear mi cuenta'} />
        ) : entrar ? (
          <FormEntrar />
        ) : (
          <FormCrear />
        )}

        <p className="mt-8 border-t border-filete pt-6 text-center text-[1.0625rem] text-tinta-media">
          {entrar ? '¿Todavía no tienes cuenta?' : '¿Ya tienes una cuenta?'}{' '}
          <Link
            to={entrar ? '/empezar' : '/entrar'}
            replace
            className="font-semibold text-acento underline-offset-4 hover:underline"
          >
            {entrar ? 'Crear cuenta' : 'Iniciar sesión'}
          </Link>
        </p>
      </div>
    </>
  )
}

function FormEntrar() {
  const { iniciarSesion } = useSesion()
  const navigate = useNavigate()
  const [correo, setCorreo] = useState('')
  const [tocado, setTocado] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const limpio = correo.trim()
  const invalido = !CORREO_VALIDO.test(limpio)
  const errorVisible =
    errorCorreo ?? (tocado && invalido ? (limpio ? 'Ese correo no parece válido.' : 'Escribe tu correo.') : null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (invalido) return
    setErrorCorreo(null)
    setNoExiste(false)
    setErrorGeneral(null)
    setEnCurso(true)
    try {
      await iniciarSesion(limpio)
    } catch (err) {
      const delCampo = errorDelCampo(err, 'email')
      if (delCampo) setErrorCorreo(delCampo)
      else setErrorGeneral(errorMessage(err))
      setNoExiste(err instanceof ApiError && err.isNotFound)
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <Field label="Correo" error={errorVisible}>
        {(props) => (
          <Input
            {...props}
            type="email"
            value={correo}
            autoFocus
            autoComplete="email"
            placeholder="ana@ejemplo.com"
            onChange={(e) => {
              setCorreo(e.target.value)
              setErrorCorreo(null)
              setNoExiste(false)
            }}
          />
        )}
      </Field>

      {noExiste && (
        <Button
          type="button"
          variante="secundario"
          tamano="sm"
          onClick={() => navigate('/empezar', { replace: true, state: { correo: limpio } })}
        >
          Crear una cuenta con este correo
        </Button>
      )}

      {errorGeneral && (
        <p role="alert" className="text-[1rem] text-error">
          {errorGeneral}
        </p>
      )}

      <Button type="submit" variante="primario" bloque cargando={enCurso}>
        {enCurso ? 'Entrando' : 'Entrar'}
      </Button>

      <p className="flex items-start gap-2 text-[1rem] text-tinta-media">
        <IconInfo className="mt-1 h-4 w-4 shrink-0" />
        <span>Por ahora basta con tu correo. No tienes que recordar ninguna contraseña.</span>
      </p>
    </form>
  )
}

function FormCrear() {
  const { crearUsuario } = useSesion()
  const location = useLocation()
  const correoInicial = (location.state as { correo?: string } | null)?.correo ?? ''
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState(correoInicial)
  const [tocado, setTocado] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const faltaNombre = nombre.trim().length === 0
  const faltaCorreo = !CORREO_VALIDO.test(correo.trim())

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (faltaNombre || faltaCorreo) return
    setErrorCorreo(null)
    setErrorGeneral(null)
    setEnCurso(true)
    try {
      await crearUsuario({ displayName: nombre.trim(), email: correo.trim() })
    } catch (err) {
      const delCampo = errorDelCampo(err, 'email')
      if (delCampo) setErrorCorreo(delCampo)
      else setErrorGeneral(errorMessage(err))
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <Field label="¿Cómo te llamamos?" error={tocado && faltaNombre ? 'Escribe tu nombre.' : null}>
        {(props) => (
          <Input
            {...props}
            value={nombre}
            autoFocus={!correoInicial}
            autoComplete="name"
            placeholder="Ana"
            onChange={(e) => setNombre(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Correo"
        ayuda="Lo usarás para volver a entrar. No te enviamos nada."
        error={errorCorreo ?? (tocado && faltaCorreo ? 'Ese correo no parece válido.' : null)}
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            value={correo}
            autoComplete="email"
            placeholder="ana@ejemplo.com"
            onChange={(e) => {
              setCorreo(e.target.value)
              setErrorCorreo(null)
            }}
          />
        )}
      </Field>

      {errorGeneral && (
        <p role="alert" className="text-[1rem] text-error">
          {errorGeneral}
        </p>
      )}

      <Button type="submit" variante="primario" bloque cargando={enCurso}>
        {enCurso ? 'Creando tu cuenta' : 'Crear mi cuenta'}
      </Button>

      <p className="flex items-start gap-2 text-[1rem] text-tinta-media">
        <IconBloqueo className="mt-1 h-4 w-4 shrink-0" />
        <span>Nexora nunca te pedirá contraseñas, códigos ni frases secretas.</span>
      </p>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 2: smart account                                              */
/* ------------------------------------------------------------------ */

function PasoCuenta() {
  const { registrarCuenta, account, user } = useSesion()
  const { data: salud } = useHealth()
  const permiteDireccionDePrueba = MOCK_ENABLED || salud?.signerMode === 'mock'
  const [direccion, setDireccion] = useState('')
  const [credentialId, setCredentialId] = useState('')
  const [tocado, setTocado] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  const limpia = direccion.trim()
  const formatoOk = /^C[A-Z2-7]{55}$/.test(limpia)
  // El mismo error que devuelve el backend, para no dejar al usuario
  // esperando un 400 que le podia haber dicho el propio formulario.
  const errorDireccion =
    tocado && !formatoOk
      ? limpia === ''
        ? 'Falta la dirección de tu cuenta.'
        : 'Debe empezar por C y tener 56 caracteres (letras mayúsculas y números).'
      : null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (!formatoOk) return
    setErrorAlta(null)
    setRegistrando(true)
    try {
      await registrarCuenta({
        smartAccountAddress: limpia,
        credentialId: credentialId.trim() || undefined,
        network: 'TESTNET',
      })
    } catch (err) {
      setErrorAlta(errorMessage(err))
    } finally {
      setRegistrando(false)
    }
  }

  if (account) {
    return (
      <div className="acceso-entrada flex flex-col gap-4">
        <Encabezado titulo="Todo listo">Ya puedes crear tu mandato y pagar.</Encabezado>
        <Exito>Cuenta registrada.</Exito>
      </div>
    )
  }

  return (
    <div className="acceso-entrada">
      <p className="mb-3 text-[1rem] font-medium text-acento">Paso 2 de 2</p>
      <Encabezado titulo={`Hola, ${user?.displayName ?? ''}. Un último paso`}>
        Registra tu smart account: el contrato desde el que salen los pagos. Tú lo despliegas por
        fuera; aquí solo lo apuntamos.
      </Encabezado>

      <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
        <p className="flex items-start gap-2 rounded-control border border-filete bg-superficie-2 px-3.5 py-3 text-[1rem] text-tinta-media">
          <IconBloqueo className="mt-1 h-4 w-4 shrink-0" />
          <span>
            Nexora nunca te pedirá tu clave privada ni tu frase de recuperación. Si alguien te las
            pide, no es Nexora.
          </span>
        </p>

        <Field
          label="Dirección del contrato (empieza por C)"
          requerido
          ayuda="Copia la dirección C… que te dio tu despliegue."
          error={errorDireccion}
        >
          {(props) => (
            <Input
              {...props}
              value={direccion}
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="C…"
              className="mono"
              onChange={(e) => setDireccion(e.target.value.trim())}
            />
          )}
        </Field>

        {permiteDireccionDePrueba && !formatoOk && (
          <Button
            type="button"
            variante="fantasma"
            tamano="sm"
            onClick={() => setDireccion(direccionDePrueba())}
          >
            Rellenar con una dirección de prueba
          </Button>
        )}

        <Field
          label="Credential ID (opcional)"
          ayuda="Solo si tu contrato usa credenciales separadas. Si no, déjalo vacío."
        >
          {(props) => (
            <Input
              {...props}
              value={credentialId}
              spellCheck={false}
              placeholder="—"
              className="mono"
              onChange={(e) => setCredentialId(e.target.value.trim())}
            />
          )}
        </Field>

        <Field label="Red">
          {(props) => (
            <Input {...props} value="TESTNET" readOnly disabled className="bg-superficie-2" />
          )}
        </Field>

        {errorAlta && (
          <p role="alert" className="text-[1rem] text-error">
            {errorAlta}
          </p>
        )}

        <Button type="submit" variante="primario" bloque cargando={registrando}>
          {registrando ? 'Registrando' : 'Registrar y entrar'}
        </Button>

        <p className="flex items-start gap-2 text-[1rem] text-tinta-media">
          <IconMandato className="mt-1 h-4 w-4 shrink-0" />
          <span>
            Después podrás crear tu mandato, que fija cuánto puede gastar el agente y a partir de
            qué monto te pregunta.
          </span>
        </p>

        {registrando && (
          <p className="flex items-center justify-center gap-2 text-[1rem] text-tinta-media">
            <Spinner className="h-4 w-4" /> Un momento
          </p>
        )}
      </form>
    </div>
  )
}
