/**
 * Enrutado y proveedores.
 *
 * El orden de los tres providers importa:
 *  1. `QueryClientProvider`  - cache de datos, la usan todos los hooks.
 *  2. `TemaProvider`         - el tema se aplica al `<html>` antes de pintar.
 *  3. `BrowserRouter`        - necesita leer la ruta actual.
 *
 * El guard de alta NO es un `<Navigate>` dentro de cada pantalla: se resuelve
 * una sola vez aqui, con el `paso` de la sesion (usuario / cuenta / listo).
 * Si cada pagina comprobara por su cuenta, habria una ventana en la que una
 * pantalla de pagos se monta sin cuenta y dispara peticiones que el backend
 * responde con 409.
 */

import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Spinner } from './components/ui'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './hooks/useConfirm'
import { TemaProvider } from './hooks'
import { useSesion } from './sesion/SesionContext'
import { ProveedorSesion } from './sesion/PrivyAuth'

import { LandingPage } from './pages/LandingPage'
import { AccesibilidadProvider, useAccesibilidad } from './accesibilidad'
import { RutaSoloAvanzado, SoloAvanzado } from './modo'
import { useTexto } from './modo/useModo'

/* ------------------------------------------------------------------ */
/* Carga diferida                                                     */
/* ------------------------------------------------------------------ */

/**
 * La landing es lo unico que llega en el primer archivo: quien la abre desde
 * un celular modesto no descarga el panel entero para leer una portada. El
 * alta, los primeros pasos y cada pantalla del panel se piden al entrar.
 */
const AppShell = lazy(() => import('./components/AppShell').then((m) => ({ default: m.AppShell })))
const AltaPage = lazy(() => import('./pages/AltaPage').then((m) => ({ default: m.AltaPage })))
const PrimerosPasosPage = lazy(() =>
  import('./pages/PrimerosPasosPage').then((m) => ({ default: m.PrimerosPasosPage })),
)
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const BilleteraPage = lazy(() =>
  import('./pages/BilleteraPage').then((m) => ({ default: m.BilleteraPage })),
)
const PendientesLayout = lazy(() =>
  import('./pages/PendientesLayout').then((m) => ({ default: m.PendientesLayout })),
)
const AprobacionesPage = lazy(() =>
  import('./pages/AprobacionesPage').then((m) => ({ default: m.AprobacionesPage })),
)
const AlertasPage = lazy(() => import('./pages/AlertasPage').then((m) => ({ default: m.AlertasPage })))
const ContactosPage = lazy(() =>
  import('./pages/ContactosPage').then((m) => ({ default: m.ContactosPage })),
)
const MandatoPage = lazy(() => import('./pages/MandatoPage').then((m) => ({ default: m.MandatoPage })))
const HistorialPage = lazy(() =>
  import('./pages/HistorialPage').then((m) => ({ default: m.HistorialPage })),
)
const AuditoriaPage = lazy(() =>
  import('./pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })),
)
const DemoPage = lazy(() => import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })))
const AccesibilidadPage = lazy(() =>
  import('./pages/AccesibilidadPage').then((m) => ({ default: m.AccesibilidadPage })),
)
const OpcionesLayout = lazy(() =>
  import('./pages/OpcionesLayout').then((m) => ({ default: m.OpcionesLayout })),
)
const CuentaPage = lazy(() => import('./pages/CuentaPage').then((m) => ({ default: m.CuentaPage })))

/** Lo que se ve mientras llega una pantalla: lo mismo que el arranque. */
function CargandoPantalla() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="h-6 w-6 text-tinta-media" />
      <span className="solo-lector">Cargando</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Configuracion de la cache                                          */
/* ------------------------------------------------------------------ */

/**
 * Un solo cliente para toda la app.
 *
 * `retry` con funcion porque un 4xx no se arregla reintentando: si el backend
 * dice 409 `CONTACTO_DUPLICADO`, insistir tres veces solo retrasa el mensaje
 * de error. Un 5xx o un fallo de red si puede ser transitorio.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (fallos, error) => {
        const status = (error as { status?: number } | null)?.status
        if (typeof status === 'number' && status >= 400 && status < 500) return false
        return fallos < 2
      },
    },
    mutations: {
      // Un clic en "Aprobar" nunca debe acabar en dos pagos intentados.
      retry: false,
    },
  },
})

/* ------------------------------------------------------------------ */
/* Cortafuegos de errores                                             */
/* ------------------------------------------------------------------ */

/**
 * Lo que dice el cortafuegos. En Simple, una frase humana; en Avanzado,
 * ademas, el mensaje tecnico del error para quien da soporte.
 */
function MensajeError({ error }: { error: Error }) {
  const t = useTexto()
  return (
    <div>
      <h1 className="text-lg font-semibold text-tinta">Algo se rompió en esta pantalla</h1>
      <p className="mt-1 max-w-md text-sm text-tinta-media">{t('errorPantalla')}</p>
      <SoloAvanzado>
        <p className="mt-3 font-mono text-2xs text-tinta-media">{error.message}</p>
      </SoloAvanzado>
    </div>
  )
}

/**
 * Si una pantalla revienta, el usuario ve un mensaje y puede recargar.
 * Antes esto no existia y un error de render dejaba la pantalla en blanco sin
 * ninguna pista de que habia pasado.
 */
class Cortafuegos extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[nexora] error de render', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <MensajeError error={this.state.error} />
        <button type="button" className="btn-primario" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}

/* ------------------------------------------------------------------ */
/* Enrutado                                                           */
/* ------------------------------------------------------------------ */

function Rutas() {
  const { cargando, user, paso } = useSesion()
  const { primerosPasosHechos } = useAccesibilidad()

  if (cargando) return <CargandoPantalla />

  // Sin usuario solo existen la landing y el alta.
  if (!user) {
    return (
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path="entrar" element={<AltaPage modo="entrar" />} />
        <Route path="empezar" element={<AltaPage modo="crear" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // Con usuario pero sin smart account registrada tampoco hay panel: el
  // backend no aceptaria ni un mandato ni un pago.
  if (paso !== 'listo') return <AltaPage />

  if (!primerosPasosHechos(user.id)) return <PrimerosPasosPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="billetera" element={<BilleteraPage />} />
        <Route element={<PendientesLayout />}>
          <Route path="aprobaciones" element={<AprobacionesPage />} />
          <Route path="alertas" element={<AlertasPage />} />
        </Route>
        <Route path="contactos" element={<ContactosPage />} />
        <Route path="opciones" element={<OpcionesLayout />}>
          <Route index element={<Navigate to="mandato" replace />} />
          <Route path="mandato" element={<MandatoPage />} />
          <Route path="accesibilidad" element={<AccesibilidadPage />} />
          <Route path="cuenta" element={<CuentaPage />} />
        </Route>
        <Route path="mandato" element={<Navigate to="/opciones/mandato" replace />} />
        <Route path="accesibilidad" element={<Navigate to="/opciones/accesibilidad" replace />} />
        <Route path="historial" element={<HistorialPage />} />
        {/* Solo en modo Avanzado: en Simple redirigen al inicio del panel. */}
        <Route
          path="auditoria"
          element={
            <RutaSoloAvanzado>
              <AuditoriaPage />
            </RutaSoloAvanzado>
          }
        />
        <Route
          path="demo"
          element={
            <RutaSoloAvanzado>
              <DemoPage />
            </RutaSoloAvanzado>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/* ------------------------------------------------------------------ */
/* App                                                                */
/* ------------------------------------------------------------------ */

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AccesibilidadProvider>
          <ProveedorSesion>
            {/* `ToastProvider` envuelve a `ConfirmProvider`: el dialogo de
                confirmacion usa un toast cuando una accion ya confirmada falla. */}
            <ToastProvider>
              <ConfirmProvider>
                <BrowserRouter>
                  <Cortafuegos>
                    <Suspense fallback={<CargandoPantalla />}>
                      <Rutas />
                    </Suspense>
                  </Cortafuegos>
                </BrowserRouter>
              </ConfirmProvider>
            </ToastProvider>
          </ProveedorSesion>
        </AccesibilidadProvider>
      </TemaProvider>
    </QueryClientProvider>
  )
}
