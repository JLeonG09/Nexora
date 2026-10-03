/**
 * "Opciones": todo lo que se configura y no se usa a diario.
 *
 * Las reglas de pago (el mandato), la accesibilidad y la cuenta comparten
 * entrada en el menu. `/mandato` y `/accesibilidad` redirigen aqui para que
 * los enlaces antiguos sigan funcionando.
 */

import { NavLink, Outlet } from 'react-router-dom'

import { cn } from '@/lib/cn'

function Pestana({ to, texto }: { to: string; texto: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-h-12 flex-1 items-center justify-center rounded-control px-4 text-base font-medium transition-colors sm:flex-none',
          isActive
            ? 'bg-superficie text-tinta shadow-sm ring-1 ring-filete'
            : 'text-tinta-media hover:text-tinta',
        )
      }
    >
      {texto}
    </NavLink>
  )
}

export function OpcionesLayout() {
  return (
    <>
      <div className="contenedor pt-6">
        <h1 className="mb-3 text-lg font-semibold tracking-tight text-tinta">Opciones</h1>
        <nav
          aria-label="Secciones de opciones"
          className="flex gap-1 rounded-card border border-filete bg-superficie-2 p-1 sm:inline-flex"
        >
          <Pestana to="/opciones/mandato" texto="Reglas de pago" />
          <Pestana to="/opciones/accesibilidad" texto="Accesibilidad" />
          <Pestana to="/opciones/cuenta" texto="Cuenta" />
        </nav>
      </div>
      <Outlet />
    </>
  )
}
