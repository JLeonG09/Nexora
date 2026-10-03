import { PanelAccesibilidad } from '@/accesibilidad'

export function AccesibilidadPage() {
  return (
    <div className="contenedor max-w-2xl py-6">
      <p className="mb-6 text-lg text-tinta-media">Ajusta la aplicación para verla con comodidad.</p>
      <PanelAccesibilidad />
    </div>
  )
}
