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

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './hooks/useConfirm'
import { TemaProvider } from './hooks'
import { SesionProvider, useSesion } from './sesion/SesionContext'

import { AltaPage } from './pages/AltaPage'
import { ChatPage } from './pages/ChatPage'
import { AprobacionesPage } from './pages/AprobacionesPage'
import { AlertasPage } from './pages/AlertasPage'
import { ContactosPage } from './pages/ContactosPage'
import { MandatoPage } from './pages/MandatoPage'
import { HistorialPage } from './pages/HistorialPage'
import { AuditoriaPage } from './pages/AuditoriaPage'
import { DemoPage } from './pages/DemoPage'

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
    console.error('[riendas] error de render', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Algo se rompió en esta pantalla</h1>
          <p className="mt-1 max-w-md text-sm text-tinta-media">
            No se ha perdido nada: los pagos siguen su curso en la red y el backend tiene el
            registro de todo. Recarga para seguir.
          </p>
          <p className="mt-3 font-mono text-2xs text-tinta-media">{this.state.error.message}</p>
        </div>
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

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-6 w-6 text-tinta-media" />
        <span className="solo-lector">Cargando</span>
      </div>
    )
  }

  // Sin usuario, la unica pantalla posible es el alta.
  if (!user) return <AltaPage />

  // Con usuario pero sin smart account registrada tampoco hay panel: el
  // backend no aceptaria ni un mandato ni un pago.
  if (paso !== 'listo') return <AltaPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="aprobaciones" element={<AprobacionesPage />} />
        <Route path="alertas" element={<AlertasPage />} />
        <Route path="contactos" element={<ContactosPage />} />
        <Route path="mandato" element={<MandatoPage />} />
        <Route path="historial" element={<HistorialPage />} />
        <Route path="auditoria" element={<AuditoriaPage />} />
        <Route path="demo" element={<DemoPage />} />
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
        <SesionProvider>
          {/* `ToastProvider` envuelve a `ConfirmProvider`: el dialogo de
              confirmacion usa un toast cuando una accion ya confirmada falla. */}
          <ToastProvider>
            <ConfirmProvider>
              <BrowserRouter>
                <Cortafuegos>
                  <Rutas />
                </Cortafuegos>
              </BrowserRouter>
            </ConfirmProvider>
          </ToastProvider>
        </SesionProvider>
      </TemaProvider>
    </QueryClientProvider>
  )
}
