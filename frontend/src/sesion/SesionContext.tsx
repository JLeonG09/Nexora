/**
 * Estado de sesion y de alta.
 *
 * Nexora no tiene autenticacion real: no hay contrasenas ni JWT. Crear la
 * cuenta (`POST /api/users`) o entrar con el correo (`POST /api/users/login`,
 * simulado) devuelve un id, y a partir de ahi todas las peticiones viajan
 * con `X-User-Id`. Por eso el provider se llama `Sesion` y
 * no `Auth`: lo que se guarda no es una credencial expirable, es el id con el
 * que el backend identifica al usuario durante la demo.
 *
 * El alta tiene DOS pasos porque el backend los exige en este orden:
 *   1. Usuario.   `POST /api/users`     -> id.
 *   2. Smart account. `POST /api/accounts` -> un contrato `C...` de testnet
 *      que el usuario despliega por fuera. El panel solo lo REGISTRA; nunca
 *      genera claves ni firma nada.
 * Sin cuenta registrada, `POST /api/mandates` responde 409 `SIN_CUENTA`.
 *
 * Cuando cualquier peticion recibe un 401, el cliente HTTP avisa por aqui y
 * la sesion se cierra sola: no hace falta que cada pantalla piense en esto.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { getUserId, setUserId, setUnauthorizedHandler, USER_KEY } from '@/api/client'
import { accounts as accountsApi, users as usersApi } from '@/api/resources'
import { ApiError } from '@/api/errors'
import type { Account, CreateUserInput, RegisterAccountInput, User } from '@/api/types'

/**
 * Paso del alta. `listo` significa que hay usuario Y cuenta, que es lo unico
 * que permite crear un mandato y por tanto pagar.
 */
export type PasoAlta = 'usuario' | 'cuenta' | 'listo'

interface SesionContextValue {
  user: User | null
  /** Smart account registrada. `null` hasta que se complete el paso 2. */
  account: Account | null
  cargando: boolean
  /** Que falta para poder operar. La app enruta segun esto. */
  paso: PasoAlta
  crearUsuario: (input: CreateUserInput) => Promise<User>
  /** Recupera un usuario existente por su correo. 404 si no hay ninguno. */
  iniciarSesion: (email: string) => Promise<User>
  registrarCuenta: (input: RegisterAccountInput) => Promise<Account>
  cerrarSesion: () => void
  /** Vuelve a leer usuario y cuenta del backend. */
  refrescar: () => Promise<void>
}

const SesionContext = createContext<SesionContextValue | null>(null)

/** Lee el usuario cacheado. Puede venir corrupto: se valida al vuelo. */
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as User) : null
  } catch {
    return null
  }
}

function cacheUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* sin persistencia */
  }
}

export function SesionProvider({
  children,
  alCerrarSesion,
}: {
  children: ReactNode
  /** Se llama al cerrar la sesion, p. ej. para salir tambien de Privy. */
  alCerrarSesion?: () => void
}) {
  const [user, setUser] = useState<User | null>(readCachedUser)
  const [account, setAccount] = useState<Account | null>(null)
  const [cargando, setCargando] = useState(true)
  const alCerrarRef = useRef(alCerrarSesion)
  alCerrarRef.current = alCerrarSesion

  const cerrarSesion = useCallback(() => {
    setUserId(null)
    cacheUser(null)
    setUser(null)
    setAccount(null)
    alCerrarRef.current?.()
  }, [])

  // Cuando cualquier peticion recibe un 401, se cierra la sesion.
  useEffect(() => {
    setUnauthorizedHandler(cerrarSesion)
  }, [cerrarSesion])

  // Al montar: si hay id guardado, se confirma contra `/users/me`.
  useEffect(() => {
    let cancelado = false

    async function verificar() {
      if (!getUserId()) {
        if (!cancelado) {
          setUser(null)
          setCargando(false)
        }
        return
      }
      try {
        const fresh = await usersApi.me()
        if (cancelado) return
        setUser(fresh)
        cacheUser(fresh)
      } catch (err) {
        // 404/401: el id guardado ya no vale, se vuelve al alta.
        if (!cancelado && (err instanceof ApiError ? err.isNotFound || err.isUnauthorized : true)) {
          cerrarSesion()
        }
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    void verificar()
    return () => {
      cancelado = true
    }
  }, [cerrarSesion])

  // La cuenta se pide despues de tener usuario. Un 404 aqui es NORMAL: es el
  // caso de un usuario recien creado que aun no registro su smart account.
  useEffect(() => {
    let cancelado = false
    if (!user) {
      setAccount(null)
      return
    }
    if (account) return

    void (async () => {
      try {
        const mine = await accountsApi.mine()
        if (!cancelado) setAccount(mine)
      } catch {
        if (!cancelado) setAccount(null)
      }
    })()

    return () => {
      cancelado = true
    }
  }, [user, account])

  const guardarUsuario = useCallback((fresh: User) => {
    setUserId(fresh.id)
    cacheUser(fresh)
    setUser(fresh)
    return fresh
  }, [])

  const crearUsuario = useCallback(
    async (input: CreateUserInput) => guardarUsuario(await usersApi.create(input)),
    [guardarUsuario],
  )

  const iniciarSesion = useCallback(
    async (email: string) => guardarUsuario(await usersApi.login(email)),
    [guardarUsuario],
  )

  const registrarCuenta = useCallback(async (input: RegisterAccountInput) => {
    // Ya hay `X-User-Id` porque `crearUsuario` se ejecuto antes.
    const fresh = await accountsApi.register(input)
    setAccount(fresh)
    return fresh
  }, [])

  const refrescar = useCallback(async () => {
    try {
      const fresh = await usersApi.me()
      setUser(fresh)
      cacheUser(fresh)
      setAccount(null)
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) cerrarSesion()
    }
  }, [cerrarSesion])

  const paso: PasoAlta = !user ? 'usuario' : !account ? 'cuenta' : 'listo'

  const value = useMemo<SesionContextValue>(
    () => ({
      user,
      account,
      cargando,
      paso,
      crearUsuario,
      iniciarSesion,
      registrarCuenta,
      cerrarSesion,
      refrescar: async () => {
        await refrescar()
      },
    }),
    [user, account, cargando, paso, crearUsuario, iniciarSesion, registrarCuenta, cerrarSesion, refrescar],
  )

  return <SesionContext.Provider value={value}>{children}</SesionContext.Provider>
}

export function useSesion(): SesionContextValue {
  const ctx = useContext(SesionContext)
  if (!ctx) throw new Error('useSesion debe usarse dentro de <SesionProvider>')
  return ctx
}
