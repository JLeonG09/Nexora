/**
 * Confirmacion de acciones destructivas, como un dialogo global.
 *
 * Por que un hook y no un `<ConfirmDialog>` en cada pagina: revocar un
 * mandato, rechazar un pago y reportar una alerta comparten el mismo
 * dialogo y los mismos textos. Con el hook, la pagina decide SI va a
 * preguntar y recibe un `boolean`, sin ensuciar su JSX con un boton, un
 * estado `abierto` y tres handlers.
 *
 * Uso:
 *   const confirmar = useConfirm()
 *   if (!(await confirmar({ titulo, mensaje }))) return
 *   // aqui va la mutacion
 *
 * El dialogo se monta una vez en la app, en `App.tsx`.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { ConfirmDialog } from '@/components/ui'
import { useToast } from '@/components/Toast'

export interface ConfirmOptions {
  titulo: string
  mensaje: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  /** `true` (por defecto) pinta el boton en rojo. */
  peligro?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

interface ConfirmContextValue {
  /** Abre el dialogo y resuelve `true` si el usuario confirma. */
  confirmar: (opciones: ConfirmOptions) => Promise<boolean>
  /** Atajo para el error de una operacion ya confirmada. */
  error: (titulo: string, detalle?: string) => void
  cargando: boolean
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [ejecutando, setEjecutando] = useState(false)
  const toast = useToast()

  const confirmar = useCallback((opciones: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opciones, resolve })
    })
  }, [])

  const cerrar = useCallback((respuesta: boolean) => {
    setPending((previo) => {
      previo?.resolve(respuesta)
      return null
    })
    setEjecutando(false)
  }, [])

  const value = useMemo<ConfirmContextValue>(
    () => ({
      confirmar,
      cargando: ejecutando,
      error: (titulo, detalle) => toast.error(titulo, detalle),
    }),
    [confirmar, ejecutando, toast],
  )

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        abierto={pending !== null}
        titulo={pending?.titulo ?? ''}
        mensaje={pending?.mensaje ?? ''}
        textoConfirmar={pending?.textoConfirmar ?? 'Confirmar'}
        textoCancelar={pending?.textoCancelar ?? 'Cancelar'}
        peligro={pending?.peligro ?? true}
        cargando={ejecutando}
        onConfirmar={() => {
          // El que confirma es el codigo de la pagina, no el dialogo.
          setEjecutando(true)
          cerrar(true)
        }}
        onCancelar={() => cerrar(false)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}
