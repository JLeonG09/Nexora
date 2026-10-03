/**
 * Login con Privy.
 *
 * Privy solo sustituye el paso 1 del alta: en vez de escribir nombre y correo
 * a mano, el usuario entra con un codigo al correo o con Google, y con esos
 * datos verificados se crea o se vincula la cuenta con el access token.
 * No se crean wallets de Privy: los pagos salen de la smart account de
 * Stellar que el usuario registra en el paso 2.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PrivyProvider, usePrivy, type User as PrivyUser } from '@privy-io/react-auth'

import { Button } from '@/components/ui'
import { IconInfo } from '@/components/icons'
import { errorMessage } from '@/api/queries'
import { PRIVY_APP_ID, PRIVY_CLIENT_ID, PRIVY_ENABLED } from '@/config/env'
import { SesionProvider, useSesion } from './SesionContext'

/** Envuelve la app con Privy si hay App ID; si no, deja la sesion de siempre. */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) return <SesionProvider>{children}</SesionProvider>

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { landingHeader: 'Entra a Nexora' },
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'off' },
        },
      }}
    >
      <SesionConPrivy>{children}</SesionConPrivy>
    </PrivyProvider>
  )
}

function SesionConPrivy({ children }: { children: ReactNode }) {
  const { logout } = usePrivy()
  return <SesionProvider alCerrarSesion={() => void logout()}>{children}</SesionProvider>
}

function datosDelUsuario(user: PrivyUser): { displayName: string; email: string } | null {
  const email = user.email?.address ?? user.google?.email
  if (!email) return null
  const displayName = user.google?.name?.trim() || email.split('@')[0]
  return { displayName, email }
}

/**
 * Acceso cuando Privy esta activo. Privy no distingue entrar de registrarse:
 * `POST /api/users` crea la fila o devuelve la que ya esta vinculada al `sub`.
 */
export function AccesoPrivy({ textoBoton }: { textoBoton: string }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { crearUsuario } = useSesion()
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const intentado = useRef(false)

  useEffect(() => {
    if (!ready || !authenticated || !user || intentado.current) return
    const datos = datosDelUsuario(user)
    if (!datos) {
      setError('Tu cuenta de Privy no tiene correo. Entra con correo o con Google.')
      return
    }
    intentado.current = true
    setCreando(true)
    crearUsuario(datos)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setCreando(false))
  }, [ready, authenticated, user, crearUsuario])

  async function salir() {
    await logout()
    intentado.current = false
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-[1rem] text-error">
          {error}
        </p>
      )}

      {authenticated ? (
        <>
          <Button type="button" variante="primario" bloque cargando={creando} disabled>
            {creando ? 'Preparando tu cuenta' : 'Sesión iniciada'}
          </Button>
          {error && (
            <Button type="button" variante="fantasma" tamano="sm" onClick={() => void salir()}>
              Entrar con otra cuenta
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          variante="primario"
          bloque
          cargando={!ready}
          disabled={!ready}
          onClick={() => login()}
        >
          {textoBoton}
        </Button>
      )}

      <p className="flex items-start gap-2 text-[1rem] text-tinta-media">
        <IconInfo className="mt-1 h-4 w-4 shrink-0" />
        <span>
          Te llega un código a tu correo, o entras con Google. Nexora no crea ninguna wallet ni ve
          tus claves.
        </span>
      </p>
    </div>
  )
}
