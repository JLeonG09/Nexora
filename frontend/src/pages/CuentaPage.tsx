/**
 * Opciones de la cuenta: quién eres, tu smart account, el tema, la guía
 * inicial y las herramientas que no son para el uso diario.
 */

import { Link, useNavigate } from 'react-router-dom'

import { useAccesibilidad } from '@/accesibilidad'
import { Button, Module, ModuleHeader, StellarAddress } from '@/components/ui'
import { useTheme } from '@/hooks'
import { useSesion } from '@/sesion/SesionContext'

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs text-tinta-media">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-tinta">{children}</dd>
    </div>
  )
}

export function CuentaPage() {
  const { user, account, cerrarSesion } = useSesion()
  const { tema, alternar } = useTheme()
  const { marcarPrimerosPasos } = useAccesibilidad()
  const navegar = useNavigate()

  return (
    <div className="contenedor flex max-w-3xl flex-col gap-4 py-6">
      <Module>
        <ModuleHeader titulo="Tu cuenta" />
        <dl className="modulo-cuerpo grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Nombre">{user?.displayName ?? '—'}</Dato>
          <Dato etiqueta="Correo">{user?.email ?? '—'}</Dato>
          <Dato etiqueta="Smart account">
            <StellarAddress publicKey={account?.smartAccountAddress ?? null} />
          </Dato>
          <Dato etiqueta="Red">{account?.network ?? '—'}</Dato>
        </dl>
      </Module>

      <Module>
        <ModuleHeader
          titulo="Apariencia"
          descripcion={tema === 'oscuro' ? 'Estás usando el tema oscuro.' : 'Estás usando el tema claro.'}
          acciones={
            <Button variante="secundario" tamano="sm" onClick={alternar}>
              {tema === 'oscuro' ? 'Usar tema claro' : 'Usar tema oscuro'}
            </Button>
          }
        />
      </Module>

      <Module>
        <ModuleHeader
          titulo="Guía inicial"
          descripcion="Vuelve a ver la guía y revisa tus contactos y reglas paso a paso."
          acciones={
            <Button variante="secundario" tamano="sm" onClick={() => user && marcarPrimerosPasos(user.id, false)}>
              Repetir los primeros pasos
            </Button>
          }
        />
      </Module>

      <Module>
        <ModuleHeader
          titulo="Herramientas avanzadas"
          descripcion="Para soporte y para presentar el proyecto, no para el uso diario."
        />
        <ul className="modulo-cuerpo flex flex-col gap-2 text-sm">
          <li>
            <Link to="/auditoria" className="font-medium text-acento underline underline-offset-2 hover:no-underline">
              Registro de auditoría
            </Link>
            <span className="text-tinta-media"> · todo lo que ha pasado en tu cuenta, en orden.</span>
          </li>
          <li>
            <Link to="/demo" className="font-medium text-acento underline underline-offset-2 hover:no-underline">
              Demo de ataque
            </Link>
            <span className="text-tinta-media"> · comprueba que el firmante frena un pago fuera de tus reglas.</span>
          </li>
        </ul>
      </Module>

      <div>
        <Button
          variante="peligro"
          onClick={() => {
            cerrarSesion()
            navegar('/')
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
