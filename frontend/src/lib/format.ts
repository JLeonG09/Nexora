/**
 * Formateo de datos para la interfaz.
 *
 * Regla general: el backend manda los importes como string decimal para no
 * perder precision. Aqui se convierten a numero SOLO para pintar, y siempre
 * con `Intl`, que ya sabe separar millares y decimales segun el locale.
 */

const LOCALE = 'es-ES'

/* --- Dinero --------------------------------------------------------- */

/**
 * Importe con su codigo de activo: `1.240,50 USDC`.
 * El numero se formatea a 2 decimales salvo que el activo tenga mas.
 */
export function formatAmount(amount: string | number, assetCode?: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  const numero = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  }).format(Number.isFinite(value) ? value : 0)
  return assetCode ? `${numero} ${assetCode}` : numero
}

/** Importe compacto para KPIs: `1,2 M` / `24,5 k`. */
export function formatCompact(amount: string | number, assetCode?: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  const numero = new Intl.NumberFormat(LOCALE, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)
  return assetCode ? `${numero} ${assetCode}` : numero
}

/** Importe sin moneda, para tablas donde la columna ya dice la moneda. */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0)
}

/* --- Aritmetica decimal ---------------------------------------------- */

/** Decimales con los que el backend serializa los importes de USDC. */
export const DECIMALES_MONTO = 7

/**
 * Convierte un importe decimal en enteros de 1/10^7 (7 decimales).
 *
 * Los importes de USDC del backend caben en 7 decimales, asi que llevarlos a
 * enteros permite sumar y restar sin perder nada. Con `BigInt` ademas no hay
 * coma flotante ni riesgo de desbordar con cifras grandes.
 */
function aEscalado(valor: string | null | undefined): bigint {
  if (typeof valor !== 'string') return 0n
  const [ent, dec = ''] = valor.trim().replace(',', '.').split('.')
  const entero = (ent ?? '').replace(/[^0-9]/g, '') || '0'
  const decimales = (dec + '0'.repeat(DECIMALES_MONTO)).slice(0, DECIMALES_MONTO)
  return BigInt(entero) * 10n ** BigInt(DECIMALES_MONTO) + BigInt(decimales)
}

/** Vuelve a componer el string que devuelve el backend. */
function deEscalado(unidades: bigint): string {
  const negativo = unidades < 0n
  const abs = negativo ? -unidades : unidades
  const base = 10n ** BigInt(DECIMALES_MONTO)
  const entero = abs / base
  const resto = (abs % base).toString().padStart(DECIMALES_MONTO, '0')
  return `${negativo ? '-' : ''}${entero}.${resto}`
}

/**
 * Suma importes EN STRING, sin pasar por `number`.
 *
 * Existe porque "pagar 0.1" tres veces son 0.3 y no 0.30000000000000004, y en
 * una pantalla que compara con topes esa diferencia se ve. Devuelve el mismo
 * formato que el backend (7 decimales), para que lo que sale de la suma se
 * pueda comparar con lo que llega de la API.
 */
export function sumarImportes(valores: (string | null | undefined)[]): string {
  return deEscalado(valores.reduce<bigint>((acc, v) => acc + aEscalado(v), 0n))
}

/**
 * `a - b`, sin bajar de cero: un tope que se muestra al usuario no puede ser
 * negativo aunque el backend devuelva un gastado mayor que el limite.
 */
export function restarImportes(a: string | null | undefined, b: string | null | undefined): string {
  const total = aEscalado(a) - aEscalado(b)
  return deEscalado(total > 0n ? total : 0n)
}

/**
 * Compara dos importes sin pasar por `number`: -1, 0 o 1.
 *
 * Los topes llegan como string ("25.0000000") y a veces se comparan contra
 * una constante escrita a mano ("25"). Como cadena "25.0000000" > "25", lo
 * que daria un falso positivo al decir que un pago supera el umbral.
 */
export function compararImportes(a: string | null | undefined, b: string | null | undefined): number {
  const x = aEscalado(a)
  const y = aEscalado(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Porcentaje que ocupa `parte` sobre `total`, acotado a 0-100.
 *
 * Aqui si se usa `number` a proposito: es una proporcion para dibujar una
 * barra, no una cantidad de dinero que el usuario vaya a leer. El importe que
 * se pinta al lado sigue siendo el string del backend.
 */
export function porcentaje(parte: string | null | undefined, total: string | null | undefined): number {
  const t = aEscalado(total)
  if (t <= 0n) return 0
  // La proporcion sale de una division entera, no de dos `number`.
  const centesimas = Number((aEscalado(parte) * 10_000n) / t) / 100
  return Math.min(100, Math.max(0, centesimas))
}

/* --- Fechas --------------------------------------------------------- */

const FECHA_CORTA = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' })
const FECHA_LARGA = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const FECHA_HORA = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const HORA = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const MES_CORTO = new Intl.DateTimeFormat(LOCALE, { month: 'short' })

/** `14 may` */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : FECHA_CORTA.format(d)
}

/** `domingo, 14 de mayo de 2026` */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : FECHA_LARGA.format(d)
}

/** `14 may 2026, 15:00` */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : FECHA_HORA.format(d)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : HORA.format(d)
}

/** `may` a partir de `2026-05`. */
export function formatMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  if (!year || !month) return ym
  return MES_CORTO.format(new Date(year, month - 1, 1))
}

/**
 * Distancia temporal legible: `hace 3 h`, `en 2 dias`, `ahora`.
 * Usa `Intl.RelativeTimeFormat` para que el redactor sea correcto.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return '—'

  const diffMs = target - Date.now()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  if (abs < MIN) return 'ahora'
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), 'minute')
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hour')
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), 'day')
  if (abs < 365 * DAY) return rtf.format(Math.round(diffMs / (30 * DAY)), 'month')
  return rtf.format(Math.round(diffMs / (365 * DAY)), 'year')
}

/* --- Fecha amigable ------------------------------------------------- */

/**
 * Locale de la fecha amigable. `es-CR` porque el publico lee la hora en
 * formato de 12 horas ("1:38 p. m."), no "13:38". Los demas helpers siguen
 * con `LOCALE`.
 */
const LOCALE_AMIGABLE = 'es-CR'

const HORA_12 = new Intl.DateTimeFormat(LOCALE_AMIGABLE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const DIA_MES = new Intl.DateTimeFormat(LOCALE_AMIGABLE, { day: 'numeric', month: 'short' })
const DIAS_RELATIVOS = new Intl.RelativeTimeFormat(LOCALE_AMIGABLE, { numeric: 'auto' })

/**
 * Dias de calendario LOCALES entre dos instantes (no bloques de 24 h): de
 * las 23:50 de ayer a las 00:10 de hoy hay un dia, aunque pasaron 20 minutos.
 * Se cuenta con `Date.UTC` sobre la fecha local para que un cambio de hora
 * no deje un dia de 23 o 25 horas.
 */
function diasDeCalendario(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  return Math.round((b - a) / 86_400_000)
}

function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Fecha para leer de un vistazo: `Hoy, 1:38 p. m.`, `Ayer, 10:38 a. m.`,
 * `29 de sept., 1:38 p. m.` y, si no es el año en curso,
 * `29 de sept. de 2025, 1:38 p. m.`.
 *
 * "Hoy" y "Ayer" van por dia de calendario local. El dia y el mes se
 * componen a mano a partir de `formatToParts` porque cada navegador trae su
 * propia version de los datos de idioma ("sept", "sep.", "sept.") y aqui se
 * quiere siempre la misma forma.
 */
export function formatFechaAmigable(
  iso: string | null | undefined,
  ahora: Date = new Date(),
): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'

  const hora = HORA_12.format(fecha)
  const dias = diasDeCalendario(fecha, ahora)
  if (dias === 0 || dias === 1) {
    return `${conMayuscula(DIAS_RELATIVOS.format(-dias, 'day'))}, ${hora}`
  }

  const partes = DIA_MES.formatToParts(fecha)
  const dia = partes.find((p) => p.type === 'day')?.value ?? String(fecha.getDate())
  const mes = (partes.find((p) => p.type === 'month')?.value ?? '').replace(/\.$/, '')
  const anio = fecha.getFullYear() === ahora.getFullYear() ? '' : ` de ${fecha.getFullYear()}`
  return `${dia} de ${mes}.${anio}, ${hora}`
}

/* --- Duratas y medidas ----------------------------------------------- */

/** `1:18.240` a partir de milisegundos. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

/** `1.600 m` */
export function formatMeters(meters: number): string {
  return `${new Intl.NumberFormat(LOCALE).format(meters)} m`
}

/** `3 años 4 meses` a partir de una fecha de nacimiento. */
export function formatAge(birthDate: string): string {
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years <= 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  if (months === 0) return `${years} ${years === 1 ? 'año' : 'años'}`
  return `${years} ${years === 1 ? 'año' : 'años'} ${months} ${months === 1 ? 'mes' : 'meses'}`
}

/* --- Texto ---------------------------------------------------------- */

/** Primeras letras para el avatar de texto. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

/** Mayusculas sin acentos, para busquedas: "Tormenta" -> "TORMENTA". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

/** `hace 3 h` para las celdas de tablas estrechas. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
