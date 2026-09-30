/**
 * Utilidades de Stellar que el frontend necesita.
 *
 * NO se incluye stellar-sdk aqui a proposito: el backend (Java, con el
 * stellar-sdk oficial) es quien construye, firma y envia las transacciones.
 * El navegador solo valida, muestra y enlaza. Asi la clave secreta nunca
 * existe en el cliente.
 */

import { STELLAR_EXPLORER } from '@/config/env'

/** Alfabeto base32 de Stellar: A-Z sin I L O U, mas 2-7. */
const BASE32_RE = /^[A-Z2-7]+$/

/**
 * Valida el FORMATO de una clave publica (StrKey `G...`), no su checksum.
 *
 * El checksum lo verifica el backend con el stellar-sdk. Aqui solo se
 * descarta el error de teclear un destino equivocado antes de wasting una
 * peticion, y se da un mensaje util.
 */
export function isValidPublicKey(value: string): boolean {
  const key = value.trim()
  if (key.length !== 56) return false
  if (key[0] !== 'G') return false
  return BASE32_RE.test(key)
}

/** Texto de error segun por que falla, para el formulario de pagos. */
export function publicKeyError(value: string): string | null {
  const key = value.trim()
  if (!key) return 'Indica la direccion de destino'
  if (key.length !== 56) return `Debe tener 56 caracteres (tiene ${key.length})`
  if (key[0] !== 'G') return 'Debe empezar por G'
  if (!BASE32_RE.test(key)) return 'Solo admite A-Z y 2-7 (formato base32 de Stellar)'
  return null
}

/** `GABC…WXYZ` — como se ve una clave en una celda de tabla. */
export function shortKey(publicKey: string | null | undefined, lead = 6, tail = 4): string {
  if (!publicKey) return '—'
  if (publicKey.length <= lead + tail + 1) return publicKey
  return `${publicKey.slice(0, lead)}…${publicKey.slice(-tail)}`
}

/** `a1b2c3d4…9f0e` — como se ve un hash de transaccion. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return '—'
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`
}

/** Enlace al explorador de Stellar para una cuenta. */
export function explorerAccount(publicKey: string): string {
  return `${STELLAR_EXPLORER}/account/${publicKey}`
}

/** Enlace al explorador para una transaccion. */
export function explorerTx(hash: string): string {
  return `${STELLAR_EXPLORER}/tx/${hash}`
}

/** Identificadores de activo tal y como los muestra Horizon. */
export type AssetKind =
  | { tipo: 'NATIVO'; code: 'XLM' }
  | { tipo: 'CREDIT'; code: string; issuer: string }

/** Normaliza el par `code` + `issuer` que llega del backend a un solo objeto. */
export function assetKind(code: string, issuer: string | null): AssetKind {
  if (code === 'XLM' || issuer === null) return { tipo: 'NATIVO', code: 'XLM' }
  return { tipo: 'CREDIT', code, issuer }
}

/** Codigo corto del activo: el issuer solo se muestra en el detalle. */
export function assetLabel(code: string, issuer?: string | null): string {
  if (code === 'XLM' || !issuer) return code
  return `${code} · ${issuer.slice(0, 4)}…`
}
