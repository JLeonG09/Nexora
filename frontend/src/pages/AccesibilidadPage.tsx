import { PanelAccesibilidad, useAccesibilidad } from '@/accesibilidad'
import { Button } from '@/components/ui'
import { useSesion } from '@/sesion/SesionContext'

export function AccesibilidadPage() {
  const { user } = useSesion()
  const { marcarPrimerosPasos } = useAccesibilidad()

  return (
    <div className="contenedor max-w-2xl py-8">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold text-tinta">Accesibilidad</h1>
        <p className="text-lg text-tinta-media">Ajusta la aplicación para verla con comodidad.</p>
      </header>

      <PanelAccesibilidad />

      <div className="mt-10 border-t border-filete pt-6">
        <p className="mb-3 text-base text-tinta-media">
          ¿Quieres volver a ver la guía inicial y revisar tus contactos y reglas?
        </p>
        <Button variante="secundario" onClick={() => user && marcarPrimerosPasos(user.id, false)}>
          Repetir los primeros pasos
        </Button>
      </div>
    </div>
  )
}
