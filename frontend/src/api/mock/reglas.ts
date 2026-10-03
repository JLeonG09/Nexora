/**
 * Interpretacion simulada de la IA + las 8 reglas de validacion.
 *
 * Traduccion directa de `MockAiClient` y `PaymentValidator` del backend. El
 * orden importa y NO se reordena: se corta en la primera regla que falla, que
 * es lo que hace el backend. Si dos reglas fallan a la vez, el usuario tiene
 * que ver la causa raiz (por ejemplo "no tienes mandato") y no la que toque
 * despues.
 *
 * Las reglas:
 *   1. Esquema: solo campos permitidos, todo texto, activo USDC.
 *   2. Confianza >= 0.7 y ningun campo sin fundamentar.
 *   3. Destinatario en los contactos: la direccion sale de la base, nunca de la IA.
 *   4. El monto aparece literalmente escrito en el mensaje.
 *   5. Mandato activo y vigente.
 *   6. Tope por transaccion.
 *   7. Tope diario (ventana movil de 24 h).
 *   8. Frecuencia de propuestas.
 *
 * Si pasan todas: monto > umbral de aprobacion -> PENDIENTE_APROBACION,
 * si no -> APROBADO (y firma directa).
 */

import type { RejectionCode } from '../types'
import { decimalUsdc, extraerMontos, montosNoAmbiguos } from './montos'
import {
  auditar,
  estado,
  formatoMonto,
  mandatoActivo,
  normalizar,
  type Mandate,
} from './estado'

/** Confianza minima que acepta el backend (`AI_MIN_CONFIDENCE`). */
export const CONFIANZA_MINIMA = 0.7
/** Propuestas permitidas en 10 minutos (`RATE_LIMIT_PROPOSALS_PER_10_MIN`). */
export const PROPUESTAS_POR_10_MIN = 5

/** Campos que la IA puede proponer. Cualquier otro es `ESQUEMA_INVALIDO`. */
const CAMPOS_PERMITIDOS = new Set(['contactId', 'contactName', 'amount', 'asset', 'memo'])

/** Campos que la IA puede marcar como "no fundamentado". */
export const CAMPOS_SIN_FUNDAMENTO = [
  'contactId',
  'contactName',
  'amount',
  'asset',
  'memo',
  'dueDate',
] as const

export type CampoSinFundamento = (typeof CAMPOS_SIN_FUNDAMENTO)[number]

/* ================================================================== */
/* Respuestas de la IA simulada                                       */
/* ================================================================== */

/** Lo que el modelo devuelve: una accion, sus argumentos y la confianza. */
export interface RespuestaIa {
  tool: 'propose_payment' | 'chat'
  arguments: Record<string, string | null>
  confidence: number
  ungroundedFields: CampoSinFundamento[] | null
  /** Frase que el agente le dice al usuario. */
  texto: string
}

export class ErrorIa extends Error {
  constructor() {
    super('El asistente no esta disponible en este momento. Intenta de nuevo en unos segundos.')
    this.name = 'ErrorIa'
  }
}

/**
 * Interpreta el mensaje del usuario.
 *
 * Reconoce la forma "Págale 15 USDC a Ana por el logo" y los marcadores `#`
 * documentados en el README, que existen para forzar cada rama sin servicios
 * reales.
 */
/**
 * Verbos que convierten un mensaje en una peticion de pago.
 *
 * El limite de palabra va AL FINAL de cada forma completa, nunca sobre una
 * raiz: por eso la lista esta escrita entera ("paga", "pagar", "pagale"...)
 * y no como "pag". Es mas texto, pero no se deja fuera la mitad del castellano
 * que la gente usa.
 */
const VERBOS_PAGO =
  /\b(paga|pago|paguen|pagamos|pagale|pagare|pagar|transferir|transfiere|transfir|manda|mandar|mandame|env[ií]a|env[ií]ar|env[ií]ale|env[ií]amelo|abona|abonar|abonate)\b/i

export function interpretar(mensaje: string): RespuestaIa {
  // Marcadores de fallo de la IA: se procesan antes que cualquier analisis.
  if (/#ia-error\b/i.test(mensaje)) throw new ErrorIa()

  const texto = mensaje.replace(/#ia-[a-z-]+/gi, ' ').trim()
  const minus = texto.toLowerCase()

  // "Hola" / "gracias" y similares: conversacion normal, sin propuesta.
  //
  // OJO con el `\b` final: se aplica al VERBO COMPLETO, no a una raiz suelta.
  // Con `/\b(pag)\b/` la palabra "paga" NO casa, porque despues de "pag" no
  // hay limite de palabra sino la letra "a". Con eso, "paga 12 USDC a Maria"
  // caia en la conversacion normal y el mock se comia los pagos. Las
  // alternativas cubren las formas que la gente escribe de verdad.
  const esPago = VERBOS_PAGO.test(minus)
  if (!esPago) {
    return {
      tool: 'chat',
      arguments: {},
      confidence: 0.95,
      ungroundedFields: null,
      texto:
        'Puedo encargarme de tus pagos. Dime a quien, cuanto y por que es, por ejemplo ' +
        '"Págale 15 USDC a Ana por el logo". Solo puedo pagar a tus contactos y dentro de los ' +
        'topes de tu mandato.',
    }
  }

  const montos = extraerMontos(texto)
  const primerMonto = montos[0]?.valor ?? null

  // Activo: se busca una sigla conocida. Si no es USDC, se devuelve igualmente
  // para que la regla 1 la rechace con ACTIVO_NO_PERMITIDO.
  const activo = detectarActivo(texto)

  // Destinatario: primero se busca un contacto real que aparezca en el texto;
  // si no hay ninguno, se toma el nombre que la persona escribió después de
  // "a" o "para".
  //
  // Esto NO es un detalle: el backend recibe de la IA un `contactName` que
  // puede no estar en la lista blanca, y de ahí sale el rechazo
  // CONTACTO_NO_ENCONTRADO con el nombre en el mensaje ("«Pedro» no está en
  // tus contactos"). Si aquí solo se aceptaran nombres ya conocidos, el mock
  // nunca mostraría ese texto y la regla 3 del panel no se podría ver.
  const contacto = detectarContacto(texto)
  const nombre = contacto ?? nombreEnTexto(texto)

  // Concepto: lo que va detras de "por"/"para"/"de".
  const memo = detectarConcepto(texto)

  // Montos no ambiguos: la IA solo puede proponer un numero que este escrito.
  const noAmbiguos = montosNoAmbiguos(texto)
  // SIEMPRE con 7 decimales: es la forma que devuelve el backend.
  const amount =
    noAmbiguos.length > 0
      ? decimalUsdc(noAmbiguos[0])
      : primerMonto !== null
        ? decimalUsdc(primerMonto)
        : null

  const argumentos: Record<string, string | null> = {
    contactId: null,
    contactName: nombre ?? null,
    amount,
    asset: activo,
    memo,
  }

  // Marcadores que fuerzan un rechazo concreto.
  let confianza = 0.93
  let sinFundamento: CampoSinFundamento[] | null = null

  if (/#ia-baja\b/i.test(mensaje)) confianza = 0.4

  if (/#ia-extra\b/i.test(mensaje)) {
    // La IA se inventa una direccion: viola el esquema (regla 1).
    argumentos.destinationAddress = 'G' + 'A'.repeat(55)
  }

  if (/#ia-inventa\b/i.test(mensaje)) {
    // La IA inventa un monto que no aparece escrito (regla 4).
    const base = argumentos.amount ? Number(argumentos.amount) : 0
    argumentos.amount = decimalUsdc(base / 100)
  }

  if (!argumentos.contactName && !argumentos.contactId) {
    sinFundamento = sinFundamento ?? ['contactName']
    confianza = Math.min(confianza, 0.6)
  }
  if (!argumentos.amount) {
    sinFundamento = sinFundamento ?? ['amount']
    confianza = Math.min(confianza, 0.6)
  }

  const textoAgente = confianza >= CONFIANZA_MINIMA
    ? 'Entendi. Voy a revisar que pase los topes de tu mandato.'
    : 'No estoy seguro de haber entendido. ¿Puedes escribirlo de nuevo con el nombre y el monto?'

  return {
    tool: 'propose_payment',
    // Sin abreviatura: `arguments` a secas resolveria al objeto implicito de
    // la funcion, no a la variable local.
    arguments: argumentos,
    confidence: confianza,
    ungroundedFields: sinFundamento,
    texto: textoAgente,
  }
}

/** `USDC`, o la primera sigla de 3-5 letras que aparezca. */
function detectarActivo(texto: string): string {
  const m = texto.match(/\b([A-Z]{3,5})\b/)
  return m ? m[1].toUpperCase() : 'USDC'
}

/**
 * Busca un contacto por nombre dentro del texto.
 *
 * Se comparan los nombres normalizados de la lista blanca. Al buscar el mas
 * largo primero se resuelve "Ana" frente a "Ana Maria" sin ambiguedad.
 */
function detectarContacto(texto: string): string | null {
  const objetivo = normalizar(texto)
  const candidatos = estado.contactos
    .map((c) => ({ c, n: normalizar(c.name) }))
    .filter(({ n }) => n.length > 0 && objetivo.includes(n))
    .sort((a, b) => b.n.length - a.n.length)
  return candidatos[0]?.c.name ?? null
}

/**
 * Nombre propio que aparece en el texto, esté o no en la lista de contactos.
 *
 * Se lee lo que va detrás de "a" o "para", con mayúscula inicial, y se corta
 * en la primera palabra en minúscula: "paga 80 USDC a Carlos por el alquiler"
 * da "Carlos", no "Carlos por el alquiler". La palabra "para" no cuenta como
 * nombre porque exige mayúscula detrás, así que "por para luego" no inventa
 * destinatario.
 *
 * La palabra clave acepta mayúsculas y minúsculas letra por letra
 * (`[aA]`, `[pP][aA][rR][aA]`) en vez de con el modificador `(?i:...)`, que
 * Node 20/22 no entienden. El nombre se sigue exigiendo con mayúscula inicial
 * porque así se escribe un nombre en español.
 */
function nombreEnTexto(texto: string): string | null {
  const m = texto.match(
    /\b(?:[aA]|[pP][aA][rR][aA])\s+([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]{1,20}(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]{1,20}){0,2})/u,
  )
  if (!m) return null
  return m[1].trim()
}

/** Lo que va detras de "por", "para" o "de": el concepto del pago. */
function detectarConcepto(texto: string): string | null {
  const m = texto.match(/\b(?:por|para|de)\s+(?:el|la|los|las|un|una)?\s*([^\n.,!?]{2,60})/i)
  if (!m) return null
  const concepto = m[1].trim()
  return concepto.length > 100 ? concepto.slice(0, 100) : concepto
}

/* ================================================================== */
/* Validacion                                                         */
/* ================================================================== */

export interface Rechazo {
  code: RejectionCode
  message: string
}

export interface ResultadoValidacion {
  valido: boolean
  rechazo: Rechazo | null
  /** Reglas que pasaron, para la auditoria. */
  checks: string[]
  /** Argumentos saneados de la IA. */
  argumentos: {
    contactId: string | null
    contactName: string | null
    amount: string | null
    asset: string
    memo: string | null
  }
  contacto: { id: string; name: string; stellarAddress: string } | null
  decision: 'PENDIENTE_APROBACION' | 'APROBADO' | 'RECHAZADO'
}

const MENSAJES: Record<RejectionCode, string> = {
  ESQUEMA_INVALIDO: 'No entendí bien el pago. Escríbelo como "Págale 15 USDC a Ana por el logo".',
  ACTIVO_NO_PERMITIDO: 'Por ahora solo puedo pagar en USDC.',
  CONFIANZA_BAJA:
    'No estoy seguro de haber entendido. ¿Puedes escribirlo de nuevo con el nombre y el monto?',
  CAMPO_NO_FUNDAMENTADO: 'No pude sacar todos los datos de tu mensaje. Incluye nombre, monto y concepto.',
  CONTACTO_NO_ENCONTRADO: '«{nombre}» no está en tus contactos. Agrégalo primero en Contactos.',
  CONTACTO_AMBIGUO: 'Tienes varios contactos que coinciden con «{nombre}». Usa el nombre exacto.',
  MONTO_NO_EN_TEXTO: 'El monto que entendí ({monto}) no aparece en tu mensaje. Escríbelo de nuevo en números.',
  MONTO_AMBIGUO: 'Escribe el monto sin separador de miles, por ejemplo 1000 o 2.5.',
  INTENCION_NEGADA: 'Entendido, no haré ese pago.',
  SIN_MANDATO_ACTIVO: 'No tienes un mandato activo. Crea uno para que el agente pueda pagar.',
  MANDATO_EXPIRADO: 'Tu mandato venció el {fecha}. Crea uno nuevo.',
  SUPERA_TOPE_TRANSACCION: 'No hice el pago: supera tu tope por transacción ({perTxLimit} USDC).',
  SUPERA_TOPE_DIARIO: 'No hice el pago: solo te quedan {disponible} USDC en las últimas 24 horas.',
  LIMITE_FRECUENCIA: 'Hiciste muchos pagos seguidos. Espera unos minutos.',
  RECHAZADO_POR_USUARIO: 'Rechazaste este pago.',
  APROBACION_EXPIRADA: 'La solicitud de aprobación venció sin respuesta.',
  MANDATO_REVOCADO: 'El mandato fue revocado antes de aprobar este pago.',
}

/**
 * Construye el rechazo con sus marcadores `{nombre}`, `{monto}`, `{fecha}`,
 * `{perTxLimit}` y `{disponible}` ya sustituidos.
 *
 * No recibe los `checks`: cada regla que llama a esta ya ha añadido su propio
 * nombre a la lista, o corta antes de llegar aqui.
 */
function rechazar(code: RejectionCode, vars: Record<string, string> = {}): Rechazo {
  const texto = Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, v),
    MENSAJES[code],
  )
  return { code, message: texto }
}

/**
 * Aplica las 8 reglas en orden y se corta en la primera que falla.
 *
 * `gasto24h` es lo ya gastado en la ventana movil; lo calcula el backend con
 * la fila de la cuenta bloqueada para que dos pagos a la vez no se cuelen,
 * y aqui lo pasa el llamador.
 */
export function validar(
  respuesta: RespuestaIa,
  textoOriginal: string,
  gasto24h: number,
  propuestasUltimos10Min: number,
): ResultadoValidacion {
  const checks: string[] = []

  /* --- Regla 1: esquema ------------------------------------------- */
  const crudos = respuesta.arguments
  const clavesFuera = Object.keys(crudos).filter((k) => !CAMPOS_PERMITIDOS.has(k))
  const tiposMalos = Object.values(crudos).some((v) => v !== null && typeof v !== 'string')

  const argumentos = {
    contactId: crudos.contactId ?? null,
    contactName: crudos.contactName ?? null,
    amount: crudos.amount ?? null,
    asset: crudos.asset ?? 'USDC',
    memo: crudos.memo ?? null,
  }

  const monto = argumentos.amount !== null ? Number(argumentos.amount) : null
  const esquemaOk =
    clavesFuera.length === 0 &&
    !tiposMalos &&
    (argumentos.contactId !== null || argumentos.contactName !== null) &&
    argumentos.amount !== null &&
    Number.isFinite(monto) &&
    monto !== null &&
    monto > 0 &&
    argumentos.asset !== null

  if (!esquemaOk) {
    return {
      valido: false,
      rechazo: rechazar('ESQUEMA_INVALIDO'),
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  if (argumentos.asset !== 'USDC') {
    return {
      valido: false,
      rechazo: rechazar('ACTIVO_NO_PERMITIDO'),
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  if (argumentos.memo !== null && argumentos.memo.length > 100) {
    return {
      valido: false,
      rechazo: rechazar('ESQUEMA_INVALIDO'),
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  checks.push('ESQUEMA')

  /* --- Regla 2: confianza y campos sin fundamento ------------------ */
  if (respuesta.confidence < CONFIANZA_MINIMA) {
    return {
      valido: false,
      rechazo: rechazar('CONFIANZA_BAJA'),
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  if (respuesta.ungroundedFields && respuesta.ungroundedFields.length > 0) {
    return {
      valido: false,
      rechazo: rechazar('CAMPO_NO_FUNDAMENTADO'),
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  checks.push('CONFIANZA')

  /* --- Regla 3: destinatario en la lista blanca -------------------- */
  const contacto = resolverContacto(argumentos.contactName)
  if (contacto.rechazo) {
    return {
      valido: false,
      rechazo: contacto.rechazo,
      checks,
      argumentos,
      contacto: null,
      decision: 'RECHAZADO',
    }
  }
  checks.push('CONTACTO')

  /* --- Regla 4: el monto esta escrito en el mensaje ---------------- */
  const tokens = extraerMontos(textoOriginal)
  const montoPropuesto = Number(argumentos.amount)
  const literal = tokens.some((t) => !t.ambiguo && t.valor === montoPropuesto)

  if (!literal) {
    const hayAmbiguo = tokens.some((t) => t.ambiguo)
    const rechazo = hayAmbiguo
      ? rechazar('MONTO_AMBIGUO')
      : tokens.length === 0
        ? { code: 'MONTO_AMBIGUO' as RejectionCode, message: 'Escribe el monto en números.' }
        : rechazar('MONTO_NO_EN_TEXTO', {
            monto: String(montoPropuesto).replace(/\.?0+$/, ''),
          })
    return {
      valido: false,
      rechazo,
      checks,
      argumentos,
      contacto: contacto.contacto,
      decision: 'RECHAZADO',
    }
  }
  checks.push('MONTO_EN_TEXTO')

  /* --- Reglas 5, 6 y 7: mandato y topes ---------------------------- */
  const limites = revisarTopes(montoPropuesto, gasto24h, checks)
  if (limites) {
    return {
      valido: false,
      rechazo: limites,
      checks,
      argumentos,
      contacto: contacto.contacto,
      decision: 'RECHAZADO',
    }
  }

  /* --- Regla 8: frecuencia ----------------------------------------- */
  if (propuestasUltimos10Min > PROPUESTAS_POR_10_MIN) {
    return {
      valido: false,
      rechazo: rechazar('LIMITE_FRECUENCIA'),
      checks,
      argumentos,
      contacto: contacto.contacto,
      decision: 'RECHAZADO',
    }
  }
  checks.push('FRECUENCIA')

  const mandato = mandatoActivo()!
  const decision = montoPropuesto > Number(mandato.approvalThreshold) ? 'PENDIENTE_APROBACION' : 'APROBADO'

  return {
    valido: true,
    rechazo: null,
    checks,
    argumentos,
    contacto: contacto.contacto,
    decision,
  }
}

/**
 * Reglas 5-7. Se vuelven a ejecutar al aprobar, con los valores de ese
 * momento: el mandato o el saldo disponible pueden haber cambiado desde que
 * el usuario vio la solicitud.
 */
export function revisarTopes(
  monto: number,
  gasto24h: number,
  checks: string[],
): Rechazo | null {
  const mandato: Mandate | null = mandatoActivo()

  if (!mandato) {
    // Distinguir "no hay mandato" de "el ultimo ya vencio" cambia el consejo.
    const ultimo = [...estado.mandatos].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0]
    if (ultimo && ultimo.status === 'EXPIRADO') {
      return rechazar('MANDATO_EXPIRADO', { fecha: fechaLegible(ultimo.expiresAt) })
    }
    return rechazar('SIN_MANDATO_ACTIVO')
  }
  checks.push('MANDATO')

  const perTx = Number(mandato.perTxLimit)
  if (monto > perTx) {
    return rechazar('SUPERA_TOPE_TRANSACCION', { perTxLimit: String(perTx) })
  }
  checks.push('TOPE_TRANSACCION')

  const diario = Number(mandato.dailyLimit)
  if (gasto24h + monto > diario) {
    const disponible = Math.max(diario - gasto24h, 0)
    return rechazar('SUPERA_TOPE_DIARIO', { disponible: String(disponible) })
  }
  checks.push('TOPE_DIARIO')

  return null
}

function resolverContacto(
  nombre: string | null,
): { contacto: { id: string; name: string; stellarAddress: string } | null; rechazo: Rechazo | null } {
  if (!nombre) {
    return { contacto: null, rechazo: rechazar('CONTACTO_NO_ENCONTRADO', { nombre: 'destinatario' }) }
  }
  const objetivo = normalizar(nombre)
  const vivos = estado.contactos
  const coincidencias = vivos.filter((c) => normalizar(c.name) === objetivo)

  if (coincidencias.length === 0) {
    return { contacto: null, rechazo: rechazar('CONTACTO_NO_ENCONTRADO', { nombre: nombre.slice(0, 40) }) }
  }
  if (coincidencias.length > 1) {
    return { contacto: null, rechazo: rechazar('CONTACTO_AMBIGUO', { nombre: nombre.slice(0, 40) }) }
  }
  return { contacto: coincidencias[0], rechazo: null }
}

/** `14 may 2026`, en el formato que usa `MandateResponse.displayDate`. */
function fechaLegible(iso: string): string {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d = new Date(iso)
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

/** Auditoria de una validacion fallida, para que quede constancia del motivo. */
export function auditarRechazo(proposalId: string, code: RejectionCode): void {
  auditar('VALIDACION_RECHAZADA', 'BACKEND', `Validacion rechazada: ${code}`, { proposalId })
}

/** Formato de monto del backend, reexportado para las pantallas del mock. */
export { formatoMonto }
