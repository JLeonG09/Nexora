/**
 * Landing publica.
 *
 * Se lee antes del alta, y quien la lee es justo la persona a la que la
 * tecnologia se le complica: adultos mayores o adultos sin practica digital.
 * Por eso rompe a proposito la densidad del panel (DESIGN.md): letra de 18 px
 * o mas, frases cortas, botones grandes y ninguna palabra tecnica sin explicar.
 * Lo que se mantiene es el vocabulario visual: modulos con filete, sin sombras
 * ni gradientes, y el color solo cuando significa algo.
 */

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'

import {
  IconAprobaciones,
  IconBloqueo,
  IconChat,
  IconCheck,
  IconContactos,
  IconError,
  IconHistorial,
  IconMandato,
  LogoNexora,
} from '@/components/icons'

const TEXTO = 'text-[1.125rem] leading-relaxed'
const BOTON_GRANDE = 'btn min-h-12 px-6 text-[1.125rem]'

/** Escalona hermanos que se revelan juntos (ver `[data-revelar]` en index.css). */
function orden(i: number): CSSProperties {
  return { '--orden': i } as CSSProperties
}

/**
 * Revela cada `[data-revelar]` la primera vez que entra en pantalla.
 * Layout effect para ocultar antes del primer pintado y no parpadear.
 */
function useRevelarAlBajar(raiz: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const nodo = raiz.current
    if (!nodo || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue
          entrada.target.classList.add('revelado')
          observador.unobserve(entrada.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    nodo.querySelectorAll('[data-revelar]').forEach((el) => observador.observe(el))
    nodo.classList.add('revelar-listo')

    return () => {
      observador.disconnect()
      nodo.classList.remove('revelar-listo')
    }
  }, [raiz])
}

export function LandingPage() {
  const raiz = useRef<HTMLDivElement>(null)
  useRevelarAlBajar(raiz)

  return (
    <div ref={raiz} className="min-h-dvh overflow-x-clip bg-fondo text-tinta">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-control focus:bg-acento focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>

      <Cabecera />

      <main id="contenido">
        <Portada />
        <ParaQuien />
        <ComoFunciona />
        <Protecciones />
        <Conversacion />
        <PensadoParaTi />
        <Preguntas />
        <Cierre />
      </main>

      <Pie />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Piezas comunes                                                     */
/* ------------------------------------------------------------------ */

function Seccion({
  id,
  titulo,
  bajada,
  alterna = false,
  children,
}: {
  id: string
  titulo: string
  bajada?: string
  alterna?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={`border-t border-filete px-5 py-16 sm:py-20 ${alterna ? 'bg-fondo-alt' : ''}`}
    >
      <div className="mx-auto max-w-5xl">
        <h2
          id={`${id}-titulo`}
          data-revelar
          className="text-[1.75rem] font-semibold leading-tight sm:text-[2.25rem]"
        >
          {titulo}
        </h2>
        {bajada && (
          <p data-revelar style={orden(1)} className={`mt-3 max-w-2xl text-tinta-media ${TEXTO}`}>
            {bajada}
          </p>
        )}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function Tarjeta({
  icono,
  titulo,
  posicion = 0,
  children,
}: {
  icono: ReactNode
  titulo: string
  /** Lugar entre sus hermanas, para escalonar la entrada. */
  posicion?: number
  children: ReactNode
}) {
  return (
    <div
      data-revelar
      style={orden(posicion)}
      className="flex flex-col gap-3 rounded-card border border-filete bg-superficie p-6"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-control bg-acento-50 text-acento [&>svg]:h-6 [&>svg]:w-6">
        {icono}
      </span>
      <h3 className="text-[1.25rem] font-semibold leading-snug">{titulo}</h3>
      <div className={`text-tinta-media ${TEXTO}`}>{children}</div>
    </div>
  )
}

function BotonEmpezar({ texto = 'Empezar ahora' }: { texto?: string }) {
  return (
    <Link to="/empezar" className={`${BOTON_GRANDE} btn-primario`}>
      {texto}
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Secciones                                                          */
/* ------------------------------------------------------------------ */

function Cabecera() {
  return (
    <header className="px-5 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Nexora, inicio">
          <LogoNexora alto={32} />
          <span className="text-[1.25rem] font-semibold tracking-tight">Nexora</span>
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-2">
          <a href="#como-funciona" className="hidden px-3 py-2 text-[1rem] text-tinta-media hover:text-tinta sm:inline">
            Cómo funciona
          </a>
          <a href="#preguntas" className="hidden px-3 py-2 text-[1rem] text-tinta-media hover:text-tinta sm:inline">
            Preguntas
          </a>
          <Link to="/entrar" className="btn btn-secundario min-h-11 px-4 text-[1rem]">
            Iniciar sesión
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Portada() {
  return (
    <section aria-labelledby="portada-titulo" className="px-5 pb-16 pt-10 sm:pb-24 sm:pt-16">
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p
            data-revelar
            className="inline-flex items-center gap-2 rounded-full border border-filete px-3 py-1 text-[0.9375rem] text-tinta-media"
          >
            <span className="h-2 w-2 rounded-full bg-led" aria-hidden="true" />
            Pagos sencillos y protegidos
          </p>
          <h1
            id="portada-titulo"
            data-revelar
            style={orden(1)}
            className="mt-5 text-[2.25rem] font-semibold leading-[1.1] tracking-tight sm:text-[3rem]"
          >
            Paga a quien quieras, solo con decirlo. Sin miedo a equivocarte.
          </h1>
          <p data-revelar style={orden(2)} className={`mt-5 max-w-xl text-tinta-media ${TEXTO} sm:text-[1.25rem]`}>
            Nexora es un asistente que hace tus pagos cuando se los pides con tus propias
            palabras. Tú decides cuánto puede gastar y a quién. Si algo no cuadra, se detiene y te
            pregunta.
          </p>
          <div data-revelar style={orden(3)} className="mt-8 flex flex-wrap gap-3">
            <BotonEmpezar />
            <a href="#como-funciona" className={`${BOTON_GRANDE} btn-secundario`}>
              Ver cómo funciona
            </a>
          </div>
          <p data-revelar style={orden(4)} className="mt-5 flex items-center gap-2 text-[1rem] text-tinta-media">
            <IconBloqueo className="h-5 w-5 shrink-0" />
            Sin contraseñas largas y sin frases secretas de 24 palabras.
          </p>
        </div>

        <EjemploMandato />
      </div>
    </section>
  )
}

/** Vista previa de un mandato, con las mismas cajas del panel. */
function EjemploMandato() {
  const reglas = [
    { etiqueta: 'Máximo por día', valor: '50 USDC', dinero: true },
    { etiqueta: 'Máximo por pago', valor: '20 USDC', dinero: true },
    { etiqueta: 'Solo puede pagar a', valor: 'Ana, Farmacia, Luz eléctrica', dinero: false },
    { etiqueta: 'Válido hasta', valor: '8 de octubre', dinero: false },
  ]
  return (
    <figure
      data-revelar="lateral"
      style={orden(2)}
      className="modulo"
      aria-label="Ejemplo de reglas que pones al asistente"
    >
      <div className="modulo-cabecera flex items-center justify-between">
        <span className="text-[1.0625rem] font-semibold">Tus reglas</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-50 px-2.5 py-0.5 text-[0.875rem] font-medium text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-led" aria-hidden="true" />
          Activas
        </span>
      </div>
      <dl className="divide-y divide-filete">
        {reglas.map((r, i) => (
          <div
            key={r.etiqueta}
            data-revelar
            style={orden(i + 4)}
            className="flex items-baseline justify-between gap-4 px-5 py-3.5"
          >
            <dt className="text-[1rem] text-tinta-media">{r.etiqueta}</dt>
            <dd className={`text-right text-[1.0625rem] font-semibold ${r.dinero ? 'text-oro' : ''}`}>
              {r.valor}
            </dd>
          </div>
        ))}
      </dl>
      <figcaption className="border-t border-filete px-5 py-3 text-[0.9375rem] text-tinta-media">
        Pagos de más de 20 USDC siempre te los pregunta primero.
      </figcaption>
    </figure>
  )
}

function ParaQuien() {
  return (
    <Seccion
      id="para-quien"
      alterna
      titulo="Hecho para quien la tecnología se le complica"
      bajada="Las apps de pago suelen dar por hecho que sabes de tecnología. Nexora no. Está pensado para dos tipos de personas:"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Tarjeta icono={<IconContactos />} titulo="Adultos mayores">
          Que quieren pagar la luz, la farmacia o mandarle dinero a un nieto sin depender de que
          alguien les ayude cada vez, y sin caer en estafas por teléfono o mensaje.
        </Tarjeta>
        <Tarjeta icono={<IconChat />} titulo="Adultos con poca práctica digital" posicion={1}>
          Que se pierden entre menús, contraseñas y botones, y prefieren decir lo que necesitan
          como se lo dirían a una persona de confianza.
        </Tarjeta>
      </div>
      <div data-revelar style={orden(2)} className="mt-5 rounded-card border border-filete bg-superficie p-6">
        <p className={TEXTO}>
          <strong className="font-semibold">También para la familia.</strong>{' '}
          <span className="text-tinta-media">
            Un hijo, una hija o un cuidador puede ayudar a poner las reglas una sola vez. Después,
            la persona usa Nexora por su cuenta, con la tranquilidad de que hay límites que nadie
            puede saltarse.
          </span>
        </p>
      </div>
    </Seccion>
  )
}

function ComoFunciona() {
  const pasos = [
    {
      titulo: 'Pones tus reglas',
      texto:
        'Cuánto se puede gastar al día, cuánto como máximo en cada pago, a quién se le puede pagar y hasta cuándo valen esas reglas.',
    },
    {
      titulo: 'Lo pides hablando',
      texto: 'Escribes como hablas: «Págale 15 a Ana por el almuerzo». No hay menús que aprender.',
    },
    {
      titulo: 'Nexora paga o te pregunta',
      texto:
        'Si el pago cumple tus reglas, se hace y te avisa. Si es grande o algo no cuadra, se detiene y espera tu permiso.',
    },
  ]
  return (
    <Seccion id="como-funciona" titulo="Cómo funciona" bajada="Tres pasos. El primero se hace una sola vez.">
      <ol className="grid gap-5 md:grid-cols-3">
        {pasos.map((p, i) => (
          <li
            key={p.titulo}
            data-revelar
            style={orden(i)}
            className="flex flex-col gap-3 rounded-card border border-filete bg-superficie p-6"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full bg-acento text-[1.25rem] font-semibold text-white"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <h3 className="text-[1.25rem] font-semibold leading-snug">
              <span className="solo-lector">Paso {i + 1}: </span>
              {p.titulo}
            </h3>
            <p className={`text-tinta-media ${TEXTO}`}>{p.texto}</p>
          </li>
        ))}
      </ol>
    </Seccion>
  )
}

function Protecciones() {
  return (
    <Seccion
      id="protecciones"
      alterna
      titulo="Tu dinero, con protecciones de verdad"
      bajada="Lo más importante de Nexora no es que pague: es todo lo que no deja hacer."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta icono={<IconMandato />} titulo="Topes que nadie se salta">
          El límite diario no lo cuida solo nuestra app: lo hace cumplir la red de pagos Stellar.
          Ni el asistente ni nosotros podemos pasarnos.
        </Tarjeta>
        <Tarjeta icono={<IconContactos />} titulo="Solo a gente de confianza" posicion={1}>
          Únicamente se paga a las personas y comercios que tú agregaste. Un desconocido no puede
          colarse en la lista.
        </Tarjeta>
        <Tarjeta icono={<IconAprobaciones />} titulo="Lo grande lo apruebas tú" posicion={2}>
          Por encima del monto que elijas, Nexora te muestra el pago y espera a que digas que sí.
        </Tarjeta>
        <Tarjeta icono={<IconError />} titulo="Un botón para detener todo">
          Si algo te parece raro, cancelas el permiso del asistente al instante. Desde ese momento
          no puede mover nada.
        </Tarjeta>
        <Tarjeta icono={<IconHistorial />} titulo="Todo queda anotado" posicion={1}>
          Cada pago, cada rechazo y cada aviso queda en un historial claro, que puedes revisar tú o
          tu familia.
        </Tarjeta>
        <Tarjeta icono={<IconBloqueo />} titulo="Nunca te pedimos claves" posicion={2}>
          Nexora jamás te pedirá contraseñas, códigos ni frases secretas. Si alguien te las pide
          en nuestro nombre, es una estafa.
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Conversacion() {
  return (
    <Seccion
      id="ejemplo"
      titulo="Así se ve en el día a día"
      bajada="Una conversación normal. Fíjate en el último mensaje: alguien intentó pagarle a un desconocido y Nexora lo frenó."
    >
      <div data-revelar className="modulo mx-auto max-w-2xl">
        <div className="modulo-cabecera flex items-center justify-start gap-2">
          <IconChat className="h-5 w-5 text-tinta-media" />
          <span className="text-[1.0625rem] font-semibold">Conversación con Nexora</span>
        </div>
        <ul className="flex flex-col gap-4 p-5">
          <Mensaje de="usuario" posicion={0}>
            Págale 15 a Ana por el almuerzo.
          </Mensaje>
          <Mensaje de="nexora" estado="ok" posicion={1}>
            Listo. Le pagué <strong className="text-oro">15 USDC</strong> a Ana. Hoy todavía puedes
            gastar <strong className="text-oro">35 USDC</strong>.
          </Mensaje>
          <Mensaje de="usuario" posicion={2}>
            Mándale 40 a la farmacia.
          </Mensaje>
          <Mensaje de="nexora" estado="aviso" posicion={3}>
            Ese pago pasa de tu máximo de 20 USDC. Te lo dejé en <strong>Aprobaciones</strong> para
            que lo confirmes tú.
          </Mensaje>
          <Mensaje de="nexora" estado="error" posicion={4}>
            Alguien intentó enviar 30 USDC a una cuenta que no está en tus contactos. Lo bloqueé y
            no se movió nada.
          </Mensaje>
        </ul>
      </div>
    </Seccion>
  )
}

const ESTADO = {
  ok: { clase: 'border-ok bg-ok-50', etiqueta: 'Pagado', texto: 'text-ok' },
  aviso: { clase: 'border-aviso bg-aviso-50', etiqueta: 'Espera tu permiso', texto: 'text-aviso' },
  error: { clase: 'border-error bg-error-50', etiqueta: 'Bloqueado', texto: 'text-error' },
} as const

function Mensaje({
  de,
  estado,
  posicion,
  children,
}: {
  de: 'usuario' | 'nexora'
  estado?: keyof typeof ESTADO
  /** Orden en la charla: los mensajes aparecen uno tras otro. */
  posicion: number
  children: ReactNode
}) {
  if (de === 'usuario') {
    return (
      <li
        data-revelar="mensaje"
        style={orden(posicion)}
        className="ml-auto max-w-[85%] rounded-card bg-acento px-4 py-3 text-[1.0625rem] leading-relaxed text-white">
        <span className="solo-lector">Tú dices: </span>
        {children}
      </li>
    )
  }
  const e = estado ? ESTADO[estado] : null
  return (
    <li
      data-revelar="mensaje"
      style={orden(posicion)}
      className={`mr-auto max-w-[85%] rounded-card border-l-4 px-4 py-3 text-[1.0625rem] leading-relaxed ${
        e ? e.clase : 'border-filete bg-superficie-2'
      }`}
    >
      <span className="solo-lector">Nexora responde: </span>
      {e && <span className={`mb-1 block text-[0.875rem] font-semibold ${e.texto}`}>{e.etiqueta}</span>}
      {children}
    </li>
  )
}

function PensadoParaTi() {
  const puntos = [
    'Letra grande y colores con buen contraste.',
    'Palabras sencillas, sin términos técnicos.',
    'Cada color viene siempre con una palabra que lo explica.',
    'Funciona con el teclado y con lectores de pantalla.',
    'Modo oscuro para descansar la vista.',
    'Nada se mueve solo ni desaparece antes de que lo leas.',
  ]
  return (
    <Seccion
      id="pensado-para-ti"
      alterna
      titulo="Pensado para leerse y usarse con calma"
      bajada="Diseñamos cada pantalla pensando en personas que no tienen por qué saber de tecnología."
    >
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {puntos.map((p, i) => (
          <li key={p} data-revelar style={orden(i)} className={`flex items-start gap-3 ${TEXTO}`}>
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-50 text-ok">
              <IconCheck className="h-4 w-4" />
            </span>
            {p}
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

function Preguntas() {
  const preguntas = [
    {
      p: '¿Necesito saber de criptomonedas?',
      r: 'No. Los pagos se hacen en USDC, una moneda digital que vale lo mismo que un dólar. Nexora se encarga de la parte técnica; tú solo dices a quién y cuánto.',
    },
    {
      p: '¿Qué pasa si alguien me engaña o intenta usar mi cuenta?',
      r: 'Aunque alguien lograra darle una orden al asistente, solo podría pagar a tus contactos y sin pasar tus topes. Esos límites los hace cumplir la red Stellar, así que no hay forma de saltárselos.',
    },
    {
      p: '¿Un familiar me puede ayudar a configurarlo?',
      r: 'Sí, y lo recomendamos. Las reglas se ponen una sola vez y después puedes usar Nexora por tu cuenta. Tu familia también puede revisar el historial contigo.',
    },
    {
      p: '¿Cuánto dinero puede mover el asistente?',
      r: 'Lo que tú decidas, y nada más. Tú eliges el máximo por día y por pago, y hasta qué fecha vale el permiso. Puedes cancelarlo cuando quieras.',
    },
    {
      p: '¿Ya puedo usarlo con dinero real?',
      r: 'Todavía no. Hoy Nexora funciona en la red de pruebas de Stellar, con dinero de práctica, para que puedas probarlo sin ningún riesgo.',
    },
  ]
  return (
    <Seccion id="preguntas" titulo="Preguntas frecuentes">
      <div data-revelar className="modulo">
        {preguntas.map((q, i) => (
          <details key={q.p} className={`group ${i > 0 ? 'border-t border-filete' : ''}`}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[1.125rem] font-semibold [&::-webkit-details-marker]:hidden">
              {q.p}
              <span
                className="text-[1.5rem] leading-none text-tinta-media transition-transform group-open:rotate-45"
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <p className={`px-5 pb-5 text-tinta-media ${TEXTO}`}>{q.r}</p>
          </details>
        ))}
      </div>
    </Seccion>
  )
}

function Cierre() {
  return (
    <section aria-labelledby="cierre-titulo" className="bg-fondo-cierre px-5 py-16 text-center sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h2
          id="cierre-titulo"
          data-revelar
          className="text-[1.75rem] font-semibold leading-tight text-white sm:text-[2.25rem]"
        >
          Tú pones las riendas. El asistente hace el resto.
        </h2>
        <p data-revelar style={orden(1)} className="mt-4 text-[1.125rem] leading-relaxed text-texto-cierre">
          Crear tu perfil toma un par de minutos y no necesitas contraseña.
        </p>
        <div data-revelar style={orden(2)} className="mt-8 flex justify-center">
          <BotonEmpezar texto="Crear mi perfil" />
        </div>
      </div>
    </section>
  )
}

function Pie() {
  return (
    <footer className="border-t border-filete px-5 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 text-[0.9375rem] text-tinta-media sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">
          <LogoNexora alto={20} />
          Nexora · pagos sencillos y protegidos
        </span>
        <span>Funciona sobre la red de pruebas de Stellar (testnet).</span>
      </div>
    </footer>
  )
}
