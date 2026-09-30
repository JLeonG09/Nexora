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

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useTheme } from '@/hooks'
import { useAprobaciones, useAlertas, useHealth, useLimites } from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { MOCK_ENABLED } from '@/config/env'
import { cn } from '@/lib/cn'
import { formatAmount, initials } from '@/lib/format'
import { Button } from './ui'
import { LogoRiendas } from './icons'
import {
  IconAlertaMovimiento,
  IconAprobaciones,
  IconAuditoria,
  IconChat,
  IconCerrar,
  IconContactos,
  IconDemo,
  IconHistorial,
  IconLuna,
  IconMandato,
  IconMenu,
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
  /** Numero de elementos que esperan una accion del usuario. */
  contador?: number
  /** Se avisa de que algo requiere atencion inmediata. */
  urgente?: boolean
}

/**
 * Se construye dentro del componente porque los contadores vienen de datos.
 */
function useEnlaces(): Enlace[] {
  const { data: aprobaciones } = useAprobaciones('PENDIENTE', 0, 1)
  const { data: alertas } = useAlertas('PENDIENTE', 0, 1)

  const pendientes = aprobaciones?.totalItems ?? 0
  const sinRevisar = alertas?.totalItems ?? 0

  return [
    { to: '/', texto: 'Chat', Icono: IconChat },
    {
      to: '/aprobaciones',
      texto: 'Aprobaciones',
      Icono: IconAprobaciones,
      contador: pendientes,
    },
    {
      to: '/alertas',
      texto: 'Alertas',
      Icono: IconAlertaMovimiento,
      contador: sinRevisar,
      urgente: sinRevisar > 0,
    },
    { to: '/contactos', texto: 'Contactos', Icono: IconContactos },
    { to: '/mandato', texto: 'Mandato', Icono: IconMandato },
    { to: '/historial', texto: 'Historial', Icono: IconHistorial },
    { to: '/auditoria', texto: 'Auditoría', Icono: IconAuditoria },
    { to: '/demo', texto: 'Demo llave robada', Icono: IconDemo },
  ]
}

const GRUPOS: { titulo: string; enlaces: string[] }[] = [
  { titulo: 'Operar', enlaces: ['/', '/aprobaciones'] },
  { titulo: 'Permisos', enlaces: ['/alertas', '/contactos', '/mandato'] },
  { titulo: 'Registrar', enlaces: ['/historial', '/auditoria'] },
  { titulo: 'Demostración', enlaces: ['/demo'] },
]

/* ------------------------------------------------------------------ */
/* Contenido de la barra lateral                                      */
/* ------------------------------------------------------------------ */

function ContenidoLateral({ onNavegar }: { onNavegar?: () => void }) {
  const enlaces = useEnlaces()
  const { user } = useSesion()

  return (
    <>
      <div className="nav-lateral__marca">
        <LogoRiendas alto={28} className="nav-lateral__logo" />
        <div className="min-w-0">
          <p className="nav-lateral__nombre">Riendas</p>
          <p className="nav-lateral__version">
            {MOCK_ENABLED ? 'Datos simulados' : 'Datos reales'}
          </p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Navegación principal">
        {GRUPOS.map((grupo) => {
          const delGrupo = enlaces.filter((e) => grupo.enlaces.includes(e.to))
          if (delGrupo.length === 0) return null
          return (
            <div key={grupo.titulo}>
              <p className="nav-lateral__grupo">{grupo.titulo}</p>
              <ul className="nav-lateral__lista">
                {delGrupo.map(({ to, texto, Icono, contador, urgente }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onNavegar}
                      className={({ isActive }) =>
                        cn('nav-lateral__enlace', isActive && 'activo')
                      }
                    >
                      <Icono />
                      <span className="truncar">{texto}</span>
                      {contador !== undefined && contador > 0 && (
                        <span
                          className={cn(
                            'nav-lateral__contador',
                            urgente && 'bg-error text-white',
                          )}
                          aria-label={`${contador} sin revisar`}
                        >
                          {contador > 99 ? '99+' : contador}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      {user && (
        <div className="nav-lateral__pie">
          <div className="flex items-center gap-2.5 rounded-control px-2 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blanco/10 text-xs font-semibold text-blanco">
              {initials(user.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncar text-xs font-medium text-blanco">{user.displayName}</p>
              <p className="truncar text-2xs text-texto-cierre opacity-70">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Barra de estado                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pie fijo con lo que el backend esta haciendo ahora.
 *
 * Importa mas de lo que parece: si el firmante esta caido, el chat seguira
 * aceptando mensajes y creyendo que paga, cuando en realidad los pagos se
 * quedaran en ENVIADO. Decirlo aqui evita esa sorpresa.
 */
function BarraEstado() {
  const { data: salud, isError } = useHealth()
  const { data: limites } = useLimites()

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-blanco/10 px-4 py-2 text-2xs text-texto-cierre">
      <span className="flex items-center gap-1.5">
        <span
          className={cn('led', (salud?.status === 'UP' && !isError) && 'encendido')}
          aria-hidden="true"
        />
        {isError ? 'Backend no responde' : `Backend ${salud?.status ?? '...'}`}
      </span>

      {salud && (
        <>
          <span>IA: {salud.aiMode === 'mock' ? 'simulada' : 'real'}</span>
          <span>Firmante: {salud.signerMode === 'mock' ? 'simulado' : 'real'}</span>
          <span>{salud.network}</span>
        </>
      )}

      {limites?.dailyLimit && (
        <span className="cifras ml-auto">
          Quedan {formatAmount(limites.availableLast24h ?? '0')} USDC hoy
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Marco                                                              */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const { tema, alternar } = useTheme()
  const { user, cerrarSesion } = useSesion()
  const navegar = useNavigate()

  return (
    <div className="panel-app">
      {/* Lateral de escritorio */}
      <aside className="nav-lateral">
        <ContenidoLateral />
        <BarraEstado />
      </aside>

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
          <LogoRiendas alto={24} />
          <span className="text-sm font-semibold">Riendas</span>
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

      <main className="min-w-0">
        <Outlet />
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
