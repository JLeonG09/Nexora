/**
 * Piezas del modo de interfaz: lo que solo existe en un modo.
 *
 *  - `<SoloAvanzado>`: detalles tecnicos (hash, explorador, direcciones G/C,
 *    comprobaciones, confianza de la IA). En Simple no se pintan.
 *  - `<SoloSimple>`: la version corta que sustituye a un detalle tecnico.
 *  - `<RutaSoloAvanzado>`: rutas que no existen en Simple (`/auditoria`,
 *    `/demo`); en Simple redirigen al inicio del panel.
 *
 * Los hooks (`useModo`, `useTexto`, `useEtiquetaActivo`) viven en
 * `./useModo` y el diccionario en `./textos`: este archivo solo exporta
 * componentes, como pide el refresco en caliente de Vite.
 */

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useModo } from './useModo'

export function SoloAvanzado({ children }: { children: ReactNode }) {
  return useModo() === 'avanzado' ? <>{children}</> : null
}

export function SoloSimple({ children }: { children: ReactNode }) {
  return useModo() === 'simple' ? <>{children}</> : null
}

export function RutaSoloAvanzado({ children }: { children: ReactNode }) {
  return useModo() === 'avanzado' ? <>{children}</> : <Navigate to="/" replace />
}
