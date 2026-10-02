/**
 * Chat con el agente.
 *
 * Es la pantalla principal porque es la unica forma de pedir un pago: el
 * usuario escribe en lenguaje natural ("paga 25 USDC a María por la pizza") y
 * el backend devuelve su respuesta mas, si ha habido, una propuesta.
 *
 * Decisiones que no son obvias y que conviene no deshacer:
 *
 *  - Pantalla minima: solo mensajes y la caja de escribir. Los topes, los
 *    contactos y las reglas ya se configuraron en "Primeros pasos".
 *  - Con el chat vacio la caja va centrada; con mensajes, abajo.
 *  - El mensaje se manda al backend y se pinta DESDE SU RESPUESTA, no de forma
 *    optimista con un texto inventado. Si el backend lo guarda con otro texto,
 *    lo que se ve en pantalla es lo que queda en el historial.
 *  - Cada propuesta se pinta como tarjeta, no como texto. El usuario tiene que
 *    ver importe, destinatario y estado sin interpretar una frase.
 *  - El marcador de "enviando" se queda hasta que el backend responde. Si se
 *    despejara al enviar, el usuario creeria que el pago ya salio.
 *  - Enter envia y Shift+Enter hace salto de linea.
 */

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorState, Spinner } from '@/components/ui'
import { IconAlertaMovimiento, IconAprobaciones, IconEnviar } from '@/components/icons'
import { TarjetaPropuesta, limpiarMarcadores } from '@/components/Propuesta'
import {
  errorMessage,
  useAlertas,
  useAprobaciones,
  useChat,
  useEnviarMensaje,
  useLimites,
  usePropuesta,
} from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { ChatMessage } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Burbuja                                                           */
/* ------------------------------------------------------------------ */

function Burbuja({
  mensaje,
  propuestaId,
  onAbrirAprobaciones,
}: {
  mensaje: ChatMessage
  propuestaId: string | null
  onAbrirAprobaciones: () => void
}) {
  const esUsuario = mensaje.role === 'USUARIO'
  const texto = limpiarMarcadores(mensaje.text)

  return (
    <div className={`emerger flex gap-3 ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      {!esUsuario && <span className="orbe orbe-pequeno mt-0.5" aria-hidden="true" />}
      <div className="max-w-[min(40rem,85%)]">
        <div
          className={cn(
            'whitespace-pre-wrap break-words text-base leading-relaxed',
            esUsuario
              ? 'rounded-card bg-acento px-4 py-2.5 text-sobre-acento'
              : 'pt-1 text-tinta',
          )}
        >
          {texto}
        </div>

        {propuestaId && (
          <div className="mt-2">
            <TarjetaPropuestaEnviada propuestaId={propuestaId} onAbrirAprobaciones={onAbrirAprobaciones} />
          </div>
        )}

        <time
          dateTime={mensaje.createdAt}
          title={formatDateTime(mensaje.createdAt)}
          className={`mt-1 block text-2xs text-tinta-media ${esUsuario ? 'text-right' : 'text-left'}`}
        >
          {formatRelative(mensaje.createdAt)}
        </time>
      </div>
    </div>
  )
}

/**
 * Tarjeta de la propuesta que acompaña a un mensaje.
 *
 * Se pide el detalle completo por su id (y no se pinta el resumen del chat)
 * porque es el unico sitio donde el backend guarda el mensaje original del
 * usuario y el codigo de rechazo.
 */
function TarjetaPropuestaEnviada({
  propuestaId,
  onAbrirAprobaciones,
}: {
  propuestaId: string
  onAbrirAprobaciones: () => void
}) {
  const { data, isPending } = usePropuesta(propuestaId)
  const { data: limites } = useLimites()

  if (isPending && !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-tinta-media">
        <Spinner className="h-3.5 w-3.5" /> Leyendo el pago…
      </p>
    )
  }

  if (!data) {
    // Puede pasar con paginas viejas: la propuesta se borro al archivar.
    return <p className="text-sm text-tinta-media">Este pago ya no está disponible.</p>
  }

  return (
    <TarjetaPropuesta
      propuesta={data}
      limits={limites ?? null}
      onAprobar={data.status === 'PENDIENTE_APROBACION' ? onAbrirAprobaciones : undefined}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Pendientes                                                         */
/* ------------------------------------------------------------------ */

/** Una linea discreta, solo si algo espera al usuario. */
function AvisosPendientes() {
  const { data: aprobaciones } = useAprobaciones('PENDIENTE', 0, 1)
  const { data: alertas } = useAlertas('PENDIENTE', 0, 1)
  const pagos = aprobaciones?.totalItems ?? 0
  const avisos = alertas?.totalItems ?? 0

  if (pagos === 0 && avisos === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {avisos > 0 && (
        <Link
          to="/alertas"
          className="inline-flex items-center gap-2 rounded-full bg-error-50 px-4 py-2 text-sm font-medium text-error hover:underline"
        >
          <IconAlertaMovimiento className="h-4 w-4" />
          {avisos === 1 ? 'Un aviso de seguridad' : `${avisos} avisos de seguridad`}
        </Link>
      )}
      {pagos > 0 && (
        <Link
          to="/aprobaciones"
          className="inline-flex items-center gap-2 rounded-full bg-acento-50 px-4 py-2 text-sm font-medium text-acento-fuerte hover:underline"
        >
          <IconAprobaciones className="h-4 w-4" />
          {pagos === 1 ? 'Un pago espera tu permiso' : `${pagos} pagos esperan tu permiso`}
        </Link>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Caja de escribir                                                   */
/* ------------------------------------------------------------------ */

function Compositor({
  texto,
  setTexto,
  enviando,
  onEnviar,
  areaRef,
}: {
  texto: string
  setTexto: (t: string) => void
  enviando: boolean
  onEnviar: (e: FormEvent) => void
  areaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const vacio = texto.trim() === ''

  // El textarea crece con el texto hasta un maximo; luego hace scroll.
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${Math.min(area.scrollHeight, 192)}px`
  }, [texto, areaRef])

  function alPulsarTecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnviar(e as unknown as FormEvent)
    }
  }

  return (
    <form
      onSubmit={onEnviar}
      className="elevada flex items-end gap-2 rounded-card py-2 pl-4 pr-2 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/25"
    >
      <textarea
        ref={areaRef}
        value={texto}
        rows={1}
        placeholder="Escribe lo que necesitas…"
        aria-label="Mensaje para tu asistente"
        className="max-h-48 flex-1 resize-none bg-transparent py-2 text-lg text-tinta outline-none placeholder:text-tinta-media"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={alPulsarTecla}
      />
      <button
        type="submit"
        disabled={vacio || enviando}
        aria-label="Enviar"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-acento text-sobre-acento transition-colors hover:bg-acento-fuerte disabled:opacity-30"
      >
        {enviando ? <Spinner className="h-5 w-5" /> : <IconEnviar className="h-5 w-5" />}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                            */
/* ------------------------------------------------------------------ */

/**
 * La conversacion abierta sobrevive a cambiar de pantalla. Si viviera solo
 * en el estado del componente, al volver de Pendientes el siguiente mensaje
 * abriria una conversacion nueva y el hilo anterior desapareceria.
 */
function useConversacionGuardada(userId: string | undefined) {
  const clave = userId ? `nexora.conversacion.${userId}` : null
  const [id, setId] = useState<string | null>(() => {
    if (!clave) return null
    try {
      return sessionStorage.getItem(clave)
    } catch {
      return null
    }
  })

  function guardar(nuevo: string) {
    setId(nuevo)
    if (!clave) return
    try {
      sessionStorage.setItem(clave, nuevo)
    } catch {
      /* sin almacenamiento: dura lo que dura la pantalla */
    }
  }

  return [id, guardar] as const
}

export function ChatPage() {
  const { user } = useSesion()
  const [conversationId, setConversationId] = useConversacionGuardada(user?.id)
  const [texto, setTexto] = useState('')
  const enviar = useEnviarMensaje()
  const navegar = useNavigate()

  const { data: mensajes, isPending, isError, error, refetch } = useChat(conversationId)

  const finRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // El hilo se desplaza al final cuando llega algo nuevo, no solo cuando se
  // envia: la respuesta del agente y la confirmacion de la red llegan solas.
  useLayoutEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' })
  }, [mensajes?.length, enviar.isPending])

  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  const limpio = texto.trim()

  async function mandar(e: FormEvent) {
    e.preventDefault()
    if (enviar.isPending || limpio.length === 0) return
    const mensaje = limpio
    setTexto('')
    try {
      const respuesta = await enviar.mutateAsync({ message: mensaje, conversationId })
      if (respuesta.conversationId) setConversationId(respuesta.conversationId)
    } catch (err) {
      // El texto vuelve al campo: si se pierde, el usuario tiene que
      // reescribir el pago entero. Es la parte que nunca hay que perder.
      setTexto(mensaje)
      console.error('[chat] no se pudo enviar', errorMessage(err))
    }
  }

  const vacio = !isPending && !isError && (mensajes?.length ?? 0) === 0 && !enviar.isPending
  const nombre = user?.displayName.trim().split(/\s+/)[0]

  const compositor = (
    <Compositor
      texto={texto}
      setTexto={setTexto}
      enviando={enviar.isPending}
      onEnviar={mandar}
      areaRef={areaRef}
    />
  )

  const errorEnvio = enviar.isError && (
    <p role="alert" className="mt-2 text-center text-sm text-error">
      {errorMessage(enviar.error)} Tu mensaje sigue en la caja.
    </p>
  )

  if (vacio) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center px-4">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8">
          <span className="orbe" aria-hidden="true" />
          <h1
            className="emerger text-center text-3xl font-semibold tracking-tight text-tinta sm:text-4xl"
            style={{ '--orden': 1 } as React.CSSProperties}
          >
            ¿En qué te ayudo
            {nombre && (
              <>
                , {nombre}
              </>
            )}
            ?
          </h1>
          <div className="emerger w-full space-y-4" style={{ '--orden': 2 } as React.CSSProperties}>
            {compositor}
            {errorEnvio}
            <AvisosPendientes />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
          <AvisosPendientes />

          {isPending && (
            <p className="flex items-center justify-center gap-2 py-8 text-base text-tinta-media">
              <Spinner className="h-5 w-5" /> Cargando la conversación
            </p>
          )}

          {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

          {mensajes?.map((mensaje) => (
            <Burbuja
              key={mensaje.id}
              mensaje={mensaje}
              propuestaId={mensaje.type === 'PROPOSAL' ? mensaje.proposalId : null}
              onAbrirAprobaciones={() => navegar('/aprobaciones')}
            />
          ))}

          {enviar.isPending && (
            <p className="emerger flex items-center gap-3 text-base text-tinta-media">
              <span className="orbe orbe-pequeno pensando" aria-hidden="true" />
              Pensando…
            </p>
          )}

          <div ref={finRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-5">
        {compositor}
        {errorEnvio}
      </div>
    </div>
  )
}
