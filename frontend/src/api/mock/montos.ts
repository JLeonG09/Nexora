/**
 * Extraccion de montos literales (regla 4 del backend: `AmountExtractor`).
 *
 * El punto de esta regla es que el monto que se paga tiene que estar
 * ESCRITO en el mensaje del usuario. Sin esto, la IA podria decidir que
 * "unos veinte" son 2000.
 *
 * La parte delicada es la ambiguedad: en "1.000" o "1,000" no se sabe si el
 * punto es decimal o separador de miles. Se marca como ambiguo y se lee como
 * miles, que es lo que hace el backend. Si el monto que la IA propuso no
 * coincide con ningun token NO ambiguo, el pago se rechaza.
 */

const PATRON = /\d+([.,]\d+)*/g
const MAX_DECIMALES = 7

export interface TokenMonto {
  /** El texto tal cual aparecia. */
  raw: string
  /** Lectura usada para comparar. */
  valor: number
  /** True si el separador podia ser miles o decimal. */
  ambiguo: boolean
}

export function extraerMontos(texto: string | null | undefined): TokenMonto[] {
  if (!texto) return []
  const salida: TokenMonto[] = []
  for (const match of texto.matchAll(PATRON)) {
    salida.push(leer(match[0]))
  }
  return salida
}

/** Solo los valores no ambiguos, en el orden del texto. */
export function montosNoAmbiguos(texto: string): number[] {
  return extraerMontos(texto)
    .filter((t) => !t.ambiguo)
    .map((t) => t.valor)
}

/** Convierte un string decimal a number, sin perder precision en la comparacion. */
export function aNumero(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null
  const limpio = texto.trim()
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Decimales con los que el backend representa los importes de USDC. */
export const DECIMALES_USDC = 7

/**
 * Deja un importe con la misma forma que el backend.
 *
 * El backend serializa los saldos de USDC con SIETE decimales siempre
 * ("12.0000000"), no "12" ni "12.5". El mock tiene que devolver exactamente
 * lo mismo: si devolviera "12", la interfaz que muestra `300.0000000` en los
 * topes y `12` en el pago parece un fallo de formato, y cualquier comparacion
 * de strings entre ambos valores daria distinta.
 */
export function decimalUsdc(valor: number | string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n)) return null
  return n.toFixed(DECIMALES_USDC)
}

function leer(raw: string): TokenMonto {
  const partes: string[] = []
  const separadores: string[] = []
  let actual = ''
  for (const c of raw) {
    if (c === '.' || c === ',') {
      partes.push(actual)
      separadores.push(c)
      actual = ''
    } else {
      actual += c
    }
  }
  partes.push(actual)

  if (separadores.length === 0) return { raw, valor: Number(raw), ambiguo: false }
  if (separadores.length === 1) {
    return leerUnSeparador(raw, partes[0], partes[1])
  }
  return leerVariosSeparadores(raw, partes, separadores)
}

function leerUnSeparador(raw: string, entero: string, fraccion: string): TokenMonto {
  const enteroEsCero = entero.split('').every((c) => c === '0')
  // "1.000": puede ser 1 o 1000. Se marca ambiguo y se lee como 1000.
  if (!enteroEsCero && fraccion.length === 3) {
    return { raw, valor: Number(entero + fraccion), ambiguo: true }
  }
  return { raw, valor: Number(`${entero}.${fraccion}`), ambiguo: false }
}

function leerVariosSeparadores(raw: string, partes: string[], separadores: string[]): TokenMonto {
  const ultimo = separadores[separadores.length - 1]
  const miles = separadores[0]
  const todosIguales = separadores.every((c) => c === miles)
  const soloDigitos = partes.join('')

  // 1.000.000 / 1,000,000: todos los grupos con 3 digitos => miles, no ambiguo.
  if (todosIguales) {
    if (gruposDeMilesValidos(partes, partes.length)) {
      return { raw, valor: Number(soloDigitos), ambiguo: false }
    }
    return { raw, valor: Number(soloDigitos), ambiguo: true }
  }

  // 1.000,50 / 1,000.50: miles con un separador, decimal con el otro (el ultimo).
  const milesConsistentes = separadores
    .slice(0, separadores.length - 1)
    .every((c) => c === miles)
  const fraccion = partes[partes.length - 1]
  if (
    milesConsistentes &&
    ultimo !== miles &&
    gruposDeMilesValidos(partes, partes.length - 1) &&
    fraccion.length <= MAX_DECIMALES
  ) {
    const entero = partes.slice(0, partes.length - 1).join('')
    return { raw, valor: Number(`${entero}.${fraccion}`), ambiguo: false }
  }
  return { raw, valor: Number(soloDigitos), ambiguo: true }
}

/** El primer grupo puede tener 1-3 digitos; los de miles, exactamente 3. */
function gruposDeMilesValidos(partes: string[], cantidadEnteros: number): boolean {
  const primero = partes[0]
  if (primero.length === 0 || primero.length > 3) return false
  for (let i = 1; i < cantidadEnteros; i++) {
    if (partes[i].length !== 3) return false
  }
  return true
}
