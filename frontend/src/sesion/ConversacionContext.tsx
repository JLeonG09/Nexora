/**
 * Que conversacion esta abierta en el chat. Lo comparten la barra lateral
 * (historial y "Nuevo chat") y la pantalla del chat.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { useSesion } from './SesionContext'
import { guardarConversacion, leerConversacion } from './conversacionGuardada'

interface ConversacionContextValue {
  /** `null` es un chat nuevo: el backend crea la conversacion con el primer mensaje. */
  conversationId: string | null
  abrir: (conversationId: string) => void
  nueva: () => void
}

const ConversacionContext = createContext<ConversacionContextValue | null>(null)

export function ConversacionProvider({ children }: { children: ReactNode }) {
  const { user } = useSesion()
  const userId = user?.id
  const [conversationId, setConversationId] = useState<string | null>(() =>
    userId ? leerConversacion(userId) : null,
  )

  const cambiar = useCallback(
    (id: string | null) => {
      setConversationId(id)
      if (userId) guardarConversacion(userId, id)
    },
    [userId],
  )

  const value = useMemo<ConversacionContextValue>(
    () => ({ conversationId, abrir: cambiar, nueva: () => cambiar(null) }),
    [conversationId, cambiar],
  )

  return <ConversacionContext.Provider value={value}>{children}</ConversacionContext.Provider>
}

export function useConversacion(): ConversacionContextValue {
  const ctx = useContext(ConversacionContext)
  if (!ctx) throw new Error('useConversacion debe usarse dentro de <ConversacionProvider>')
  return ctx
}
