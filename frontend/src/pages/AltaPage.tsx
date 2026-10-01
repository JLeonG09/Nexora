/**
 * Alta: usuario y smart account.
 *
 * Son DOS pasos porque el backend los exige en ese orden y porque son dos
 * cosas conceptualmente distintas:
 *
 *  1. `POST /api/users` crea la identidad del panel. No hay contraseña ni
 *     sesión que expirar: el id que devuelve pasa a viajar en `X-User-Id`.
 *  2. `POST /api/accounts` REGISTRA una smart account que el usuario ya
 *     desplegó por fuera. El panel no genera claves, no pide seed phrase y
 *     no firma nada. Si se perdiera la clave privada, el dinero tampoco
 *     estaría aquí, y eso es justo lo que hay que decir antes de empezar.
 *
 * Por eso esta pantalla no parece un login: no pide una contraseña que no
 * existe y explica en voz alta qué se está haciendo con cada dato.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button, Exito, Field, Input, Spinner } from '@/components/ui'
import { IconBloqueo, IconCheck, IconInfo, IconMandato } from '@/components/icons'
import { errorMessage } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { MOCK_ENABLED, PRIVY_ENABLED } from '@/config/env'
import { LogoNexora } from '@/components/icons'
import { PasoUsuarioPrivy } from '@/sesion/PrivyAuth'

/* ------------------------------------------------------------------ */
/* Direccion de prueba                                                */
/* ------------------------------------------------------------------ */

/** Alfabeto base32 de Stellar (RFC 4648 sin padding) para una `C...` valida. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Direccion de contrato ficticia pero CON FORMATO VALIDO.
 *
 * Solo se usa en modo mock, y esta marcada como tal en la interfaz. Existe
 * porque el alta exige una direccion real de 56 caracteres: sin ella nadie
 * puede recorrer la demo, y un formulario que exige algo que el usuario no
 * tiene todavia no es una demo, es un tickets.
 */
function direccionDePrueba(): string {
  const Cuerpo = Array.from({ length: 55 }, () => BASE32[Math.floor(Math.random() * 32)]).join('')
  return `C${Cuerpo}`
}

/* ------------------------------------------------------------------ */
/* Estructura                                                         */
/* ------------------------------------------------------------------ */

export function AltaPage() {
  const { user, cerrarSesion } = useSesion()
  const pasoUsuario = user === null

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Marca paso={pasoUsuario ? 1 : 2} />
      {pasoUsuario ? PRIVY_ENABLED ? <PasoUsuarioPrivy /> : <PasoUsuario /> : <PasoCuenta />}
      {!user && (
        <Link
          to="/"
          className="text-2xs text-tinta-media underline underline-offset-2 hover:text-tinta"
        >
          Volver al inicio
        </Link>
      )}
      {user && (
        <button
          type="button"
          onClick={cerrarSesion}
          className="text-2xs text-tinta-media underline underline-offset-2 hover:text-tinta"
        >
          Empezar de cero con otro usuario
        </button>
      )}
    </div>
  )
}

function Marca({ paso }: { paso: 1 | 2 }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <LogoNexora alto={40} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Nexora</h1>
        <p className="mt-1 max-w-sm text-sm text-tinta-media">
          Un agente que paga por ti, con topes que decides tú y que puede parar solo.
        </p>
      </div>

      <ol className="flex items-center gap-2 text-2xs" aria-label="Pasos del alta">
        {(['Tu nombre', 'Tu cuenta'] as const).map((texto, i) => {
          const numero = i + 1
          const activo = numero === paso
          const hecho = numero < paso
          return (
            <li key={texto} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-2xs font-semibold ${
                  activo
                    ? 'border-acento bg-acento text-white'
                    : hecho
                      ? 'border-ok bg-ok text-white'
                      : 'border-linea text-tinta-media'
                }`}
                aria-current={activo ? 'step' : undefined}
              >
                {hecho ? <IconCheck className="h-3 w-3" /> : numero}
              </span>
              <span className={activo ? 'font-medium text-tinta' : 'text-tinta-media'}>{texto}</span>
              {numero === 1 && <span className="text-tinta-media">→</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 1: usuario                                                    */
/* ------------------------------------------------------------------ */

function PasoUsuario() {
  const { crearUsuario } = useSesion()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [tocado, setTocado] = useState(false)
  const [crearUsuarioEnCurso, setCrearUsuarioEnCurso] = useState(false)
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  const faltaNombre = nombre.trim().length === 0
  const faltaCorreo = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())
  const invalido = faltaNombre || faltaCorreo

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (invalido) return
    setErrorAlta(null)
    setCrearUsuarioEnCurso(true)
    try {
      await crearUsuario({ displayName: nombre.trim(), email: correo.trim() })
    } catch (err) {
      setErrorAlta(errorMessage(err))
    } finally {
      setCrearUsuarioEnCurso(false)
    }
  }

  return (
    <form onSubmit={enviar} className="modulo w-full max-w-md" noValidate>
      <div className="modulo-cabecera">
        <h2 className="modulo-cabecera__titulo">¿Quién eres?</h2>
        <p className="mt-0.5 text-xs text-tinta-media">
          Es para que el historial de pagos tenga un nombre legible. No hay contraseña.
        </p>
      </div>

      <div className="modulo-cuerpo flex flex-col gap-3">
        <Field
          label="Cómo te llamamos"
          requerido
          error={tocado && faltaNombre ? 'Escribe un nombre.' : null}
        >
          {(props) => (
            <Input
              {...props}
              value={nombre}
              autoFocus
              autoComplete="name"
              placeholder="Ana"
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Correo"
          requerido
          ayuda="Solo informativo. El sistema no te envía nada ni verifica que exista."
          error={tocado && faltaCorreo ? 'Ese correo no parece válido.' : null}
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              value={correo}
              autoComplete="email"
              placeholder="ana@ejemplo.com"
              onChange={(e) => setCorreo(e.target.value)}
            />
          )}
        </Field>

        {errorAlta && (
          <p role="alert" className="text-xs text-error">
            {errorAlta}
          </p>
        )}

        <Button type="submit" variante="primario" bloque cargando={crearUsuarioEnCurso}>
          {crearUsuarioEnCurso ? 'Creando tu perfil' : 'Continuar'}
        </Button>

        <p className="flex items-start gap-1.5 text-2xs text-tinta-media">
          <IconInfo className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Nexora no guarda contraseñas porque no hay servidor donde compararlas. Tu
            identificador queda en este navegador y viaja en cada petición.
          </span>
        </p>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Paso 2: smart account                                              */
/* ------------------------------------------------------------------ */

function PasoCuenta() {
  const { registrarCuenta, account } = useSesion()
  const [direccion, setDireccion] = useState('')
  const [credentialId, setCredentialId] = useState('')
  const [tocado, setTocado] = useState(false)
  const [registrarCuentaEnCurso, setRegistrando] = useState(false)
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
      <div className="modulo w-full max-w-md">
        <div className="modulo-cabecera">
          <h2 className="modulo-cabecera__titulo">Todo listo</h2>
        </div>
        <div className="modulo-cuerpo flex flex-col gap-3">
          <Exito>Cuenta registrada. Ya puedes crear tu mandato y pagar.</Exito>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="modulo w-full max-w-md" noValidate>
      <div className="modulo-cabecera">
        <h2 className="modulo-cabecera__titulo">Registra tu smart account</h2>
        <p className="mt-0.5 text-xs text-tinta-media">
          Es el contrato desde el que salen los pagos. Tú lo despliegas por fuera; aquí solo
          lo apuntamos.
        </p>
      </div>

      <div className="modulo-cuerpo flex flex-col gap-3">
        <p className="flex items-start gap-2 rounded-control border border-linea bg-superficie-2 px-2.5 py-2 text-2xs text-tinta-media">
          <IconBloqueo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tinta-media" />
          <span>
            Nexora nunca te pedirá tu clave privada ni tu frase de recuperación. Si alguien te
            las pide, no es Nexora.
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

        {MOCK_ENABLED && !formatoOk && (
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
          <p role="alert" className="text-xs text-error">
            {errorAlta}
          </p>
        )}

        <Button type="submit" variante="primario" bloque cargando={registrarCuentaEnCurso}>
          {registrarCuentaEnCurso ? 'Registrando' : 'Registrar y entrar'}
        </Button>

        <p className="flex items-start gap-1.5 text-2xs text-tinta-media">
          <IconMandato className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Después de esto podrás crear tu mandato, que es el que fija cuánto puede gastar el
            agente y a partir de qué monto te pregunta.
          </span>
        </p>

        {registrarCuentaEnCurso && (
          <p className="flex items-center justify-center gap-2 text-2xs text-tinta-media">
            <Spinner className="h-3 w-3" /> Un momento
          </p>
        )}
      </div>
    </form>
  )
}
