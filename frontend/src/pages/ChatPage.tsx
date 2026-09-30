/**
 * Chat con el agente.
 *
 * Es la pantalla principal porque es la unica forma de pedir un pago: el
 * usuario escribe en lenguaje natural ("paga 25 USDC a María por la pizza") y
 * el backend devuelve su respuesta mas, si ha habido, una propuesta.
 *
 * Decisiones que no son obvias y que conviene no deshacer:
 *
 *  - El mensaje se manda al backend y se pinta DESDE SU RESPUESTA, no de forma
 *    optimista con un texto inventado. Si el backend lo guarda con otro texto,
 *    lo que se ve en pantalla es lo que queda en el historial.
 *  - Cada propuesta se pinta como tarjeta, no como texto. El usuario tiene que
 *    ver importe, destinatario y estado sin Interpretar una frase.
 *  - El marcador de "enviando" se queda hasta que el backend responde. Si se
 *    despejara al enviar, el usuario creeria que el pago ya salio.
 *  - El textarea crece con el texto y Enter envia, Shift+Enter hace salto de
 *    linea: es lo que espera cualquiera que haya usado un chat.
 */

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, EmptyState, ErrorState, Spinner, Textarea } from '@/components/ui'
import { IconChat, IconEnviar, IconMandato } from '@/components/icons'
import { TarjetaPropuesta, limpiarMarcadores } from '@/components/Propuesta'
import { AvisoSimulado, GastoBar } from '@/components/domain'
import {
  errorMessage,
  useChat,
  useEnviarMensaje,
  useHealth,
  useLimites,
  useMandatoActivo,
  usePropuesta,
} from '@/api/queries'
import { useSesion } from '@/sesion/SesionContext'
import { formatAmount, formatDateTime, formatRelative } from '@/lib/format'
import type { ChatMessage } from '@/api/types'

/* ------------------------------------------------------------------ */
/* Sugerencias                                                        */
/* ------------------------------------------------------------------ */

/**
 * Primeros mensajes de un usuario que no conoce el sistema.
 *
 * Cada uno prueba una regla distinta a proposito: uno que debe pagarse
 * solo (dentro del mandato), uno que debe pedir confirmacion (supera el
 * umbral) y uno que debe ser rechazado (destinatario desconocido). Asi el
 * primer minuto de uso ya enseña cómo decide el agente.
 */
const SUGERENCIAS = [
  { texto: 'Paga 12 USDC a María por la cena de ayer', nota: 'Dentro del mandato: se paga solo' },
  { texto: 'Paga 900 USDC a Carlos por el alquiler', nota: 'Supera el umbral: te lo pregunta' },
  { texto: 'Paga 20 USDC a mi primo', nota: 'No es un contacto: se rechaza' },
]

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
    <div className={`flex ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[min(42rem,85%)] ${esUsuario ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-control px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            esUsuario
              ? 'bg-acento text-white'
              : 'border border-linea bg-superficie-1 text-tinta'
          }`}
        >
          {texto}
        </div>

        {propuestaId && (
          <div className={esUsuario ? 'mt-1.5' : 'mt-1.5'}>
            <TarjetaPropuestaEnviada
              propuestaId={propuestaId}
              onAbrirAprobaciones={onAbrirAprobaciones}
            />
          </div>
        )}

        <time
          dateTime={mensaje.createdAt}
          title={formatDateTime(mensaje.createdAt)}
          className={`mt-1 block text-2xs text-tinta-media ${
            esUsuario ? 'text-right' : 'text-left'
          }`}
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
 *
 * Los topes vigentes se pasan a la tarjeta para que la lista de las ocho
 * comprobaciones pueda decir cuales fallaron sin inventarselas.
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
      <div className="flex items-center gap-2 rounded-control border border-linea bg-superficie-1 px-3 py-2 text-2xs text-tinta-media">
        <Spinner className="h-3 w-3" /> Leyendo la propuesta
      </div>
    )
  }

  if (!data) {
    // Puede pasar con paginas viejas: la propuesta se borro al archivar.
    return (
      <p className="rounded-control border border-linea bg-superficie-1 px-3 py-2 text-2xs text-tinta-media">
        Esta propuesta ya no está disponible.
      </p>
    )
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
/* Barra del mandato                                                  */
/* ------------------------------------------------------------------ */

/**
 * Recordatorio permanente de los topes, arriba del hilo.
 *
 * Si el usuario no tiene esto a la vista, escribe "paga 900" sin saber que
 * esta pidiendo una confirmacion. Se muestra el limite que de verdad manda:
 * el umbral de aprobacion, no solo el tope diario.
 */
function BarraMandato() {
  const { data: mandato } = useMandatoActivo()
  const { data: limites } = useLimites()

  if (!mandato && !limites?.dailyLimit) {
    return (
      <p className="flex items-center gap-1.5 text-2xs text-aviso">
        <IconMandato className="h-3.5 w-3.5 shrink-0" />
        No tienes un mandato: el agente no podrá pagar hasta que lo crees.
      </p>
    )
  }

  return (
    <div className="w-full max-w-md">
      <GastoBar
        gastado={limites?.spentLast24h ?? '0'}
        diario={limites?.dailyLimit ?? '0'}
        umbral={limites?.approvalThreshold ?? null}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pagina                                                            */
/* ------------------------------------------------------------------ */

export function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const enviar = useEnviarMensaje()
  const navegar = useNavigate()
  const { user } = useSesion()
  const { data: salud } = useHealth()

  const { data: mensajes, isPending, isError, error, refetch } = useChat(conversationId)

  const finRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // El hilo se desplaza al final cuando llega algo nuevo, no solo cuando se
  // envia: la respuesta del agente y la confirmacion de la red llegan solas.
  useLayoutEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' })
  }, [mensajes?.length, enviar.isPending])

  // Autofoco al montar, para poder escribir sin tocar el ratón.
  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  const limpio = texto.trim()
  const bloqueado = enviar.isPending || limpio.length === 0

  async function mandar(e: FormEvent) {
    e.preventDefault()
    if (bloqueado) return
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

  function alPulsarTecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void mandar(e as unknown as FormEvent)
    }
  }

  const vacio = !isPending && !isError && (mensajes?.length ?? 0) === 0

  return (
    <div className="flex h-dvh flex-col">
      {/* --- Cabecera con los topes ---------------------------------- */}
      <header className="pagina-cabecera shrink-0">
        <div className="contenedor flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-tinta">
                Hola{user ? `, ${user.displayName}` : ''}
              </h1>
              <p className="truncar text-2xs text-tinta-media">
                Pide un pago como si se lo dijeras a una persona.
              </p>
            </div>
            <div className="flex w-full max-w-xs items-center gap-3">
              <BarraMandato />
            </div>
          </div>
          <AvisoSimulado aiMode={salud?.aiMode} signerMode={salud?.signerMode} />
        </div>
      </header>

      {/* --- Hilo --------------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="contenedor flex flex-col gap-4 py-5">
          {isPending && (
            <p className="flex items-center justify-center gap-2 py-8 text-xs text-tinta-media">
              <Spinner className="h-4 w-4" /> Cargando la conversación
            </p>
          )}

          {isError && <ErrorState error={error} onReintentar={() => void refetch()} />}

          {vacio && <EstadoInicial onElegir={setTexto} />}

          {mensajes?.map((mensaje) => (
            <Burbuja
              key={mensaje.id}
              mensaje={mensaje}
              propuestaId={mensaje.type === 'PROPOSAL' ? mensaje.proposalId : null}
              onAbrirAprobaciones={() => navegar('/aprobaciones')}
            />
          ))}

          {/* Marca de "el agente esta escribiendo" */}
          {enviar.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-control border border-linea bg-superficie-1 px-3 py-2">
                <Spinner className="h-3.5 w-3.5 text-tinta-media" />
                <span className="text-2xs text-tinta-media">El agente lo está pensando</span>
              </div>
            </div>
          )}

          <div ref={finRef} />
        </div>
      </div>

      {/* --- Red de seguridad del envio ------------------------------ */}
      {enviar.isError && (
        <p role="alert" className="contenedor pb-1 text-2xs text-error">
          {errorMessage(enviar.error)} Tu mensaje sigue en el campo.
        </p>
      )}

      {/* --- Compositor --------------------------------------------- */}
      <form
        onSubmit={mandar}
        className="shrink-0 border-t border-linea bg-superficie-1/95 backdrop-blur"
      >
        <div className="contenedor flex items-end gap-2 py-3">
          <Textarea
            ref={areaRef}
            value={texto}
            rows={1}
            placeholder="Paga 25 USDC a María por la pizza…"
            aria-label="Mensaje para el agente"
            className="max-h-40 min-h-10 flex-1 resize-none"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alPulsarTecla}
          />
          <Button
            type="submit"
            variante="primario"
            disabled={bloqueado}
            cargando={enviar.isPending}
            className="h-10 shrink-0"
          >
            {!enviar.isPending && <IconEnviar className="h-4 w-4" />}
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
        <p className="contenedor pb-2 text-2xs text-tinta-media">
          Enter para enviar · Shift+Enter para una línea nueva. Solo USDC y solo a tus contactos.
        </p>
      </form>
    </div>
  )
}



/* ------------------------------------------------------------------ */
/* Estado inicial                                                     */
/* ------------------------------------------------------------------ */

function EstadoInicial({ onElegir }: { onElegir: (texto: string) => void }) {
  const { data: limites } = useLimites()

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <EmptyState
        icono={<IconChat className="h-5 w-5" />}
        titulo="Escribe un pago como si fuera una frase"
        descripcion="El agente lo entiende, comprueba que el destinatario sea uno de tus contactos y que el monto esté en tu mensaje, y paga solo dentro de los topes que le diste."
      />

      <div className="w-full max-w-md space-y-2">
        <p className="text-2xs font-medium text-tinta-media">Prueba con:</p>
        <ul className="space-y-2">
          {SUGERENCIAS.map((s) => (
            <li key={s.texto}>
              <button
                type="button"
                onClick={() => onElegir(s.texto)}
                className="w-full rounded-control border border-linea bg-superficie-1 px-3 py-2 text-left transition-colors hover:border-acento/50 hover:bg-superficie-2"
              >
                <p className="text-sm text-tinta">«{s.texto}»</p>
                <p className="mt-0.5 text-2xs text-tinta-media">{s.nota}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {limites?.dailyLimit && (
        <p className="text-center text-2xs text-tinta-media">
          Hoy te quedan{' '}
          <span className="cifras font-medium text-tinta">
            {formatAmount(limites.availableLast24h ?? '0')} USDC
          </span>
          , y por encima de{' '}
          <span className="cifras font-medium text-tinta">
            {formatAmount(limites.approvalThreshold ?? '0')} USDC
          </span>{' '}
          te preguntará antes de pagar.
        </p>
      )}
    </div>
  )
}

