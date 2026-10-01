/**
 * "Pendientes": pagos que esperan permiso y avisos de seguridad, juntos.
 *
 * Para el usuario las dos cosas son lo mismo (algo espera su respuesta), asi
 * que comparten una entrada en el menu. Las rutas `/aprobaciones` y
 * `/alertas` se mantienen porque el chat y las tarjetas enlazan a ellas.
 */

import { NavLink, Outlet } from 'react-router-dom'

import { useAlertas, useAprobaciones } from '@/api/queries'
import { cn } from '@/lib/cn'

function Pestana({ to, texto, contador, urgente }: { to: string; texto: string; contador: number; urgente?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-control px-4 text-base font-medium transition-colors sm:flex-none',
          isActive
            ? 'bg-superficie text-tinta shadow-sm ring-1 ring-filete'
            : 'text-tinta-media hover:text-tinta',
        )
      }
    >
      {texto}
      {contador > 0 && (
        <span
          className={cn(
            'rounded-full px-2 text-sm font-semibold',
            urgente ? 'bg-error text-blanco' : 'bg-acento text-sobre-acento',
          )}
        >
          {contador}
        </span>
      )}
    </NavLink>
  )
}

export function PendientesLayout() {
  const { data: aprobaciones } = useAprobaciones('PENDIENTE', 0, 1)
  const { data: alertas } = useAlertas('PENDIENTE', 0, 1)

  return (
    <>
      <div className="contenedor pt-6">
        <nav
          aria-label="Tipo de pendiente"
          className="flex gap-1 rounded-card border border-filete bg-superficie-2 p-1 sm:inline-flex"
        >
          <Pestana
            to="/aprobaciones"
            texto="Pagos por confirmar"
            contador={aprobaciones?.totalItems ?? 0}
          />
          <Pestana
            to="/alertas"
            texto="Avisos de seguridad"
            contador={alertas?.totalItems ?? 0}
            urgente
          />
        </nav>
      </div>
      <Outlet />
    </>
  )
}
