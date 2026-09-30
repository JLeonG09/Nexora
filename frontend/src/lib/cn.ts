/**
 * `cn` — unir clases de Tailwind de forma condicional.
 *
 * Es un `clsx` minimo: aplana arrays, descarta valores falsy y respecta
 * objetos `{ 'clase': condicion }`.
 *
 * NO resuelve conflictos entre utilidades (no es un `tailwind-merge`). La
 * razon es que resolverlos a ciegas es peor que no resolverlos: dos clases
 * como `text-sm` y `text-tinta-media` comparten prefijo pero NO se pisan,
 * y una heuristica que las considerara conflictivas dejaria texto sin
 * color. Los componentes de este proyecto, en cambio, estan escritos para
 * que el `className` recibido solo anada espaciado o anchura, nunca color.
 */

type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | undefined | null>

function flatten(value: ClassValue, out: string[]): void {
  if (value === null || value === undefined || value === false || value === '') return
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out)
    return
  }
  for (const [clase, activa] of Object.entries(value)) {
    if (activa) out.push(clase)
  }
}

/** Une los argumentos en un unico string de clases, sin duplicar entradas. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  flatten(values, out)
  // Se dedupenan las clases exactas: `cn('btn', 'btn')` -> 'btn'.
  return Array.from(new Set(out)).join(' ')
}
