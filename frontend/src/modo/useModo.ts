/**
 * Hooks del modo de interfaz (Simple / Avanzado).
 *
 * El modo es una preferencia mas de Accesibilidad (`preferencias.modo`), asi
 * que se guarda, se aplica a `<html data-modo>` y se elige en el mismo panel
 * que la letra. Estos hooks solo la leen. Van en un `.ts` aparte de los
 * componentes de `./index.tsx` para no romper el refresco en caliente.
 */

import { useCallback } from 'react'

import { useAccesibilidad } from '@/accesibilidad'
import { TEXTOS, etiquetaActivo, type ClaveTexto, type Modo } from './textos'

/** Modo actual: `'simple'` (por defecto) o `'avanzado'`. */
export function useModo(): Modo {
  return useAccesibilidad().preferencias.modo
}

/** `t('tituloReglas')` → "Mis reglas de pago" en Simple, "Mandato" en Avanzado. */
export function useTexto(): (clave: ClaveTexto) => string {
  const modo = useModo()
  return useCallback((clave: ClaveTexto) => TEXTOS[clave][modo], [modo])
}

/** Etiqueta del activo en pantalla: "dólares" en Simple, el codigo en Avanzado. */
export function useEtiquetaActivo(): (asset?: string | null) => string {
  const modo = useModo()
  return useCallback((asset?: string | null) => etiquetaActivo(asset, modo), [modo])
}
