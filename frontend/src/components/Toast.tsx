/**
 * Avisos emergentes (toasts).
 *
 * Se montan UNA vez en `App`, cerca de la raiz, y se usan con `useToast()`.
 * Toda operacion que el usuario initiate y que deba confirmar (crear, enviar,
 * borrar) termina con un aviso: el usuario nunca queda dudando si paso algo.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { IconAlerta, IconCheck, IconCerrar, IconError, IconInfo } from '@/components/icons'

export type ToastVariant = 'exito' | 'error' | 'aviso' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  /** Milisegundos en pantalla. `0` = no se cierra solo (hay que pulsarlo). */
  duracion: number
}

interface ToastContextValue {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'duracion'> & { duracion?: number }) => number
  exito: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  aviso: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Duracion por tipo. Los errores se quedan mas tiempo: hay que leerlos. */
const DURACION: Record<ToastVariant, number> = {
  exito: 4000,
  info: 5000,
  aviso: 7000,
  error: 9000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((previas) => previas.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback<ToastContextValue['push']>(
    (toast) => {
      const id = nextId.current++
      const duracion = toast.duracion ?? DURACION[toast.variant]
      setToasts((previas) => [...previas.slice(-3), { ...toast, id, duracion }])
      if (duracion > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duracion),
        )
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      exito: (title, description) => void push({ variant: 'exito', title, description }),
      error: (title, description) => void push({ variant: 'error', title, description }),
      aviso: (title, description) => void push({ variant: 'aviso', title, description }),
      info: (title, description) => void push({ variant: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

/**
 * Lanza un error. Acepta `unknown` para poder pasarle lo que devuelve una
 * mutacion sin comprobar antes; si el error viene del backend, muestra
 * su mensaje en espanol.
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Presentacion                                                        */
/* ------------------------------------------------------------------ */

const VARIANTE_ESTILO: Record<ToastVariant, { clase: string; Icono: typeof IconCheck }> = {
  exito: { clase: 'text-ok', Icono: IconCheck },
  error: { clase: 'text-error', Icono: IconError },
  aviso: { clase: 'text-aviso', Icono: IconAlerta },
  info: { clase: 'text-info', Icono: IconInfo },
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="avisos" role="region" aria-label="Avisos">
      {toasts.map((toast) => {
        const { clase, Icono } = VARIANTE_ESTILO[toast.variant]
        return (
          <div key={toast.id} className="aviso" role="status" aria-live="polite">
            <Icono className={clase} />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-tinta-media">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="btn-fantasma -m-1 shrink-0 rounded p-1 text-tinta-media hover:text-tinta"
              aria-label="Cerrar aviso"
            >
              <IconCerrar />
            </button>
          </div>
        )
      })}
    </div>
  )
}
