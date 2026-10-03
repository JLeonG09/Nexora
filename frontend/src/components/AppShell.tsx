/**
 * Marco de la aplicacion: navegacion lateral, barra superior y barra de estado.
 *
 * La navegacion NO es una lista decorativa: refleja el orden en que el
 * usuario tiene que trabajar. Primero lo que requiere su decision (lo que
 * esta esperando su OK y las alertas), luego la operacion diaria (chat,
 * contactos), y al final lo que se consulta (historial, auditoria).
 *
 * El contador de la barra lateral no es un adorno: son pagos y movimientos
 * que necesitan una accion suya. Es lo unico del panel que puede—if no que
 * se pase por alto—dinero o una llave.
 */

import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useTheme } from '@/hooks'
import { useAprobaciones, useAlertas, useConversaciones, useHealth } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { ConversacionProvider, useConversacion } from '@/sesion/ConversacionContext'
import { cn } from '@/lib/cn'
import { formatRelative, initials } from '@/lib/format'
import { Button, Spinner } from './ui'
import { LogoNexora } from './icons'
import {
  IconAprobaciones,
  IconBilletera,
  IconChat,
  IconCerrar,
  IconContactos,
  IconHistorial,
  IconInicio,
  IconLuna,
  IconMenu,
  IconNuevoChat,
  IconOpciones,
  IconPanel,
  IconSalir,
  IconSol,
} from './icons'

/* ------------------------------------------------------------------ */
/* Navegacion                                                         */
/* ------------------------------------------------------------------ */

interface Enlace {
  to: string
  texto: string
  Icono: typeof IconChat
  /** Rutas que tambien marcan este enlace como activo. */
  activoEn?: string[]
  /** Numero de elementos que esperan una accion del usuario. */
  contador?: number
  /** Se avisa de que algo requiere atencion inmediata. */
  urgente?: boolean
}

/**
 * Cinco entradas y ninguna mas, sin tecnicismos: quien la usa no sabe que es
 * un "mandato" ni una "auditoria". Aprobaciones y alertas van juntas en
 * "Pendientes" porque para el usuario son lo mismo: algo que espera su
 * respuesta. "Mi billetera" va justo despues de Inicio: es la pregunta
 * que mas se repite ("cuanto puedo gastar hoy").
 *
 * Fuera del menu, a proposito:
 *  - "Opciones" va en el pie, junto a la cuenta: reglas de pago,
 *    accesibilidad y cuenta se ajustan de vez en cuando, no a diario.
 *  - `/auditoria` y `/demo` se enlazan desde Opciones > Cuenta. La auditoria
 *    es para soporte y la demo del atacante es para presentar el proyecto.
 */
function useEnlaces(): Enlace[] {
  const { data: aprobaciones } = useAprobaciones('PENDIENTE', 0, 1)
  const { data: alertas } = useAlertas('PENDIENTE', 0, 1)

  const pendientes = aprobaciones?.totalItems ?? 0
  const sinRevisar = alertas?.totalItems ?? 0

  return [
    { to: '/', texto: 'Inicio', Icono: IconInicio },
    { to: '/billetera', texto: 'Mi billetera', Icono: IconBilletera },
    {
      to: sinRevisar > 0 && pendientes === 0 ? '/alertas' : '/aprobaciones',
      texto: 'Pendientes',
      Icono: IconAprobaciones,
      activoEn: ['/aprobaciones', '/alertas'],
      contador: pendientes + sinRevisar,
      urgente: sinRevisar > 0,
    },
    { to: '/contactos', texto: 'Mis contactos', Icono: IconContactos },
    { to: '/historial', texto: 'Mis movimientos', Icono: IconHistorial },
  ]
}

function EnlaceLateral({ enlace, onNavegar }: { enlace: Enlace; onNavegar?: () => void }) {
  const { pathname } = useLocation()
  const { to, texto, Icono, activoEn, contador, urgente } = enlace

  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        onClick={onNavegar}
        className={({ isActive }) =>
          cn('nav-lateral__enlace', (isActive || activoEn?.includes(pathname)) && 'activo')
        }
      >
        <Icono />
        <span className="truncar">{texto}</span>
        {contador !== undefined && contador > 0 && (
          <span
            className={cn('nav-lateral__contador', urgente && 'bg-error text-blanco')}
            aria-label={`${contador} sin revisar`}
          >
            {contador > 99 ? '99+' : contador}
          </span>
        )}
      </NavLink>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Contenido de la barra lateral                                      */
/* ------------------------------------------------------------------ */

/**
 * Chats anteriores. Cada inicio de sesion abre un chat nuevo, asi que esta
 * lista es la unica forma de volver a una conversacion pasada.
 */
function HistorialChats({ onNavegar }: { onNavegar?: () => void }) {
  const { data: conversaciones } = useConversaciones()
  const { conversationId, abrir } = useConversacion()
  const { pathname } = useLocation()
  const navegar = useNavigate()

  if (!conversaciones || conversaciones.length === 0) return null

  return (
    <>
      <p className="nav-lateral__grupo">Chats recientes</p>
      <ul className="nav-lateral__lista pb-2">
        {conversaciones.map((c) => (
          <li key={c.conversationId}>
            <button
              type="button"
              title={`${c.title} · ${formatRelative(c.lastMessageAt)}`}
              onClick={() => {
                abrir(c.conversationId)
                navegar('/')
                onNavegar?.()
              }}
              className={cn(
                'nav-lateral__enlace nav-lateral__chat w-full text-left',
                pathname === '/' && c.conversationId === conversationId && 'activo',
              )}
            >
              <span className="truncar">{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function ContenidoLateral({ onNavegar, onEsconder }: { onNavegar?: () => void; onEsconder?: () => void }) {
  const principales = useEnlaces()
  const { user, cerrarSesion } = useSesion()
  const { nueva } = useConversacion()
  const navegar = useNavigate()

  return (
    <>
      <div className="nav-lateral__marca">
        <LogoNexora alto={28} tono="claro" className="nav-lateral__logo" />
        <div className="min-w-0 flex-1">
          <p className="nav-lateral__nombre">Nexora</p>
          <p className="nav-lateral__version">Tu asistente de pagos</p>
        </div>
        {onEsconder && (
          <Button
            variante="fantasma"
            icono
            onClick={onEsconder}
            aria-label="Esconder el menú"
            title="Esconder el menú"
            className="text-texto-cierre hover:bg-blanco/10 hover:text-blanco"
          >
            <IconPanel />
          </Button>
        )}
      </div>

      <div className="px-2.5 pb-1">
        <button
          type="button"
          onClick={() => {
            nueva()
            navegar('/')
            onNavegar?.()
          }}
          className="nav-lateral__enlace nav-lateral__nuevo w-full"
        >
          <IconNuevoChat />
          <span>Nuevo chat</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pt-1" aria-label="Navegación principal">
        <ul className="nav-lateral__lista">
          {principales.map((enlace) => (
            <EnlaceLateral key={enlace.texto} enlace={enlace} onNavegar={onNavegar} />
          ))}
        </ul>
        <HistorialChats onNavegar={onNavegar} />
      </nav>

      {user && (
        <div className="nav-lateral__pie space-y-1">
          <div className="flex items-center gap-3 rounded-control px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blanco/10 text-sm font-semibold text-blanco">
              {initials(user.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncar text-sm font-medium text-blanco">{user.displayName}</p>
              <p className="truncar text-2xs text-texto-cierre opacity-70">{user.email}</p>
            </div>
          </div>
          <NavLink
            to="/opciones"
            onClick={onNavegar}
            className={({ isActive }) => cn('nav-lateral__enlace w-full', isActive && 'activo')}
          >
            <IconOpciones />
            <span>Opciones</span>
          </NavLink>
          <button
            type="button"
            onClick={() => {
              cerrarSesion()
              navegar('/')
            }}
            className="nav-lateral__enlace w-full"
          >
            <IconSalir />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Barra de estado                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pie fijo con el estado del servicio, en palabras.
 *
 * El detalle tecnico (modo de la IA, del firmante, red) sigue disponible
 * plegado: si el firmante esta caido, los pagos se quedan en ENVIADO y quien
 * da soporte necesita verlo sin abrir la consola.
 */
function BarraEstado() {
  const { data: salud, isError } = useHealth()
  const funciona = !!salud && !isError

  return (
    <details className="border-t border-blanco/10 px-4 py-2.5 text-xs text-texto-cierre">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span className={cn('led', funciona && 'encendido')} aria-hidden="true" />
        {isError ? 'Sin conexión con el servicio' : funciona ? 'Todo funciona bien' : 'Conectando…'}
      </summary>
      {salud && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs opacity-80">
          <span>Servicio: {salud.status}</span>
          <span>IA: {salud.aiMode === 'mock' ? 'simulada' : salud.aiMode === 'local' || salud.aiMode === 'hybrid' ? 'local' : 'real'}</span>
          <span>Firmante: {salud.signerMode === 'mock' ? 'simulado' : 'real'}</span>
          <span>Red: {salud.network}</span>
        </p>
      )}
    </details>
  )
}

/* ------------------------------------------------------------------ */
/* Marco                                                              */
/* ------------------------------------------------------------------ */

const CLAVE_LATERAL_OCULTO = 'nexora.lateral.oculto'

/** En escritorio el lateral se puede esconder; la preferencia se recuerda. */
function useLateralOculto() {
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_LATERAL_OCULTO) === '1'
    } catch {
      return false
    }
  })

  function cambiar(valor: boolean) {
    setOculto(valor)
    try {
      localStorage.setItem(CLAVE_LATERAL_OCULTO, valor ? '1' : '0')
    } catch {
      /* sin persistencia */
    }
  }

  return [oculto, cambiar] as const
}

export function AppShell() {
  return (
    <ConversacionProvider>
      <Marco />
    </ConversacionProvider>
  )
}

function Marco() {
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const [lateralOculto, setLateralOculto] = useLateralOculto()
  const { tema, alternar } = useTheme()
  const { user, cerrarSesion } = useSesion()
  const navegar = useNavigate()

  return (
    <div className={cn('panel-app', lateralOculto && 'lateral-oculto')}>
      {/* Lateral de escritorio */}
      <aside className="nav-lateral">
        <ContenidoLateral onEsconder={() => setLateralOculto(true)} />
        <BarraEstado />
      </aside>

      {lateralOculto && (
        <button
          type="button"
          onClick={() => setLateralOculto(false)}
          aria-label="Mostrar el menú"
          title="Mostrar el menú"
          className="abrir-lateral"
        >
          <IconPanel className="h-5 w-5" />
        </button>
      )}

      {/* Barra superior en movil */}
      <header className="barra-superior">
        <Button
          variante="fantasma"
          icono
          onClick={() => setCajonAbierto(true)}
          aria-label="Abrir navegación"
          className="text-blanco hover:bg-blanco/10 hover:text-blanco"
        >
          <IconMenu />
        </Button>

        <div className="flex items-center gap-2">
          <LogoNexora alto={24} tono="claro" />
          <span className="text-sm font-semibold">Nexora</span>
        </div>

        <div className="flex items-center gap-1">
          <MandoTema tema={tema} alternar={alternar} claro />
          {user && (
            <button
              type="button"
              onClick={() => {
                cerrarSesion()
                navegar('/')
              }}
              aria-label="Cerrar sesión"
              className="btn-fantasma flex h-9 w-9 items-center justify-center rounded text-blanco hover:bg-blanco/10"
            >
              <IconSalir className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="fondo-galaxia min-w-0 bg-fondo">
        {/* Cada pantalla llega por separado: mientras tanto el marco se queda. */}
        <Suspense
          fallback={
            <div className="flex min-h-dvh items-center justify-center">
              <Spinner className="h-6 w-6 text-tinta-media" />
              <span className="solo-lector">Cargando</span>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Cajon en movil */}
      {cajonAbierto && (
        <>
          <div className="cajon-fondo" onClick={() => setCajonAbierto(false)} />
          <div className="cajon" role="dialog" aria-modal="true" aria-label="Navegación">
            <div className="flex justify-end p-2">
              <Button
                variante="fantasma"
                icono
                onClick={() => setCajonAbierto(false)}
                aria-label="Cerrar navegación"
                className="text-blanco hover:bg-blanco/10 hover:text-blanco"
              >
                <IconCerrar />
              </Button>
            </div>
            <ContenidoLateral onNavegar={() => setCajonAbierto(false)} />
            <BarraEstado />
          </div>
        </>
      )}
    </div>
  )
}

/** Boton de tema, en la barra lateral clara y en la barra superior oscura. */
function MandoTema({
  tema,
  alternar,
  claro = false,
}: {
  tema: 'claro' | 'oscuro'
  alternar: () => void
  claro?: boolean
}) {
  const Icono = tema === 'oscuro' ? IconSol : IconLuna
  return (
    <Button
      variante="fantasma"
      icono
      onClick={alternar}
      aria-label={tema === 'oscuro' ? 'Usar tema claro' : 'Usar tema oscuro'}
      className={claro ? '' : 'text-blanco hover:bg-blanco/10 hover:text-blanco'}
    >
      <Icono />
    </Button>
  )
}
