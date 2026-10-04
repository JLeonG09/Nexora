/**
 * Rutas de la API, agrupadas por recurso.
 *
 * Fuente de verdad: los `@RequestMapping` de
 * `backend/src/main/java/com/nexora/controllers/`.
 *
 * OJO, dos cosas que rompieron el contrato anterior y aqui NO se repiten:
 *  - No hay version en la ruta. Los controladores cuelgan de `/api/**`, sin
 *    `/v1`. Anadirlo daria 404 en todas las peticiones.
 *  - La autenticacion va en `Authorization: Bearer` (access token de Privy).
 *    La gestiona `client.ts` sola: estas funciones no reciben el token.
 */

import { API_PREFIX } from '@/config/env'
import type { AlertStatus, ApprovalStatus, ProposalStatus } from './types'

/**
 * `?a=1&b=2`, omitiendo null/undefined/vacio.
 *
 * Acepta cualquier objeto plano, no solo `Record<string, ...>`, para poder
 * pasarle `{ ...params, status }` sin pelearse con el indice de tipos.
 */
function qs(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const texto = search.toString()
  return texto ? `?${texto}` : ''
}

export interface PageParams {
  page?: number
  size?: number
}

export const endpoints = {
  /* --- Salud ------------------------------------------------------- */
  /** Unico endpoint publico. Sirve para el LED de conexion. */
  health: () => `${API_PREFIX}/health`,

  /* --- Usuario ----------------------------------------------------- */
  /**
   * Crea o vincula al usuario del access token. El `sub` es la credencial;
   * el cuerpo solo aporta el nombre para mostrar.
   */
  createUser: () => `${API_PREFIX}/users`,
  me: () => `${API_PREFIX}/users/me`,

  /* --- Smart account ----------------------------------------------- */
  /** Registra la smart account del usuario. */
  createAccount: () => `${API_PREFIX}/accounts`,
  myAccount: () => `${API_PREFIX}/accounts/me`,
  /** Llave publica del agente para la version vigente. */
  agentPublicKey: () => `${API_PREFIX}/agent/public-key`,

  /* --- Contactos --------------------------------------------------- */
  contacts: (p?: PageParams) => `${API_PREFIX}/contacts${qs(p ?? {})}`,
  contact: (id: string) => `${API_PREFIX}/contacts/${id}`,

  /* --- Mandato ----------------------------------------------------- */
  /**
   * El mandato se crea con los datos que ya están en la cadena (hash de la
   * transaccion, version de llave, contextRuleId): el panel nunca firma.
   */
  createMandate: () => `${API_PREFIX}/mandates`,
  activeMandate: () => `${API_PREFIX}/mandates/active`,
  activeLimits: () => `${API_PREFIX}/mandates/active/limits`,
  mandates: (p?: PageParams) => `${API_PREFIX}/mandates${qs(p ?? {})}`,
  revokeMandate: (id: string) => `${API_PREFIX}/mandates/${id}/revoke`,

  /* --- Chat -------------------------------------------------------- */
  /** Sin `conversationId` el backend abre una conversacion nueva. */
  sendChat: () => `${API_PREFIX}/chat`,
  chatMessages: (conversationId?: string | null) =>
    `${API_PREFIX}/chat/messages${qs({ conversationId })}`,
  /** Conversaciones del usuario, la mas reciente primero. */
  chatConversations: (limit?: number) => `${API_PREFIX}/chat/conversations${qs({ limit })}`,

  /* --- Propuestas de pago ------------------------------------------ */
  proposals: ({ status, ...params }: PageParams & { status?: ProposalStatus | null }) =>
    `${API_PREFIX}/proposals${qs({ ...params, status })}`,
  proposal: (id: string) => `${API_PREFIX}/proposals/${id}`,

  /* --- Aprobaciones ------------------------------------------------ */
  approvals: ({ status, ...params }: PageParams & { status?: ApprovalStatus | null }) =>
    `${API_PREFIX}/approvals${qs({ ...params, status })}`,
  approve: (id: string) => `${API_PREFIX}/approvals/${id}/approve`,
  reject: (id: string) => `${API_PREFIX}/approvals/${id}/reject`,

  /* --- Alertas ----------------------------------------------------- */
  alerts: ({ status, ...params }: PageParams & { status?: AlertStatus | null }) =>
    `${API_PREFIX}/alerts${qs({ ...params, status })}`,
  /** "Si fui yo": la alerta se cierra sin tocar el mandato. */
  confirmAlert: (id: string) => `${API_PREFIX}/alerts/${id}/confirm`,
  /** "No fui yo": revoca el mandato y rota la llave. Accion grave. */
  reportAlert: (id: string) => `${API_PREFIX}/alerts/${id}/report`,

  /* --- Historial y auditoria --------------------------------------- */
  history: (p?: PageParams) => `${API_PREFIX}/history${qs(p ?? {})}`,
  audit: ({ proposalId, ...params }: PageParams & { proposalId?: string | null }) =>
    `${API_PREFIX}/audit${qs({ ...params, proposalId })}`,

  /* --- Demo: atacante con la llave robada -------------------------- */
  /** Intenta un pago desde la smart account sin pasar por el agente. */
  runAttack: () => `${API_PREFIX}/demo/attack`,

  /* --- Herramientas del agente ------------------------------------- */
  /**
   * SOLO lectura, y exigen `X-Service-Key`: las usa el LLM desde fuera, no
   * este panel. Se listan para dejar constancia de que el frontend no las
   * llama; no hay wrappers en `resources.ts` a proposito.
   */
  agentTools: {
    contacts: `${API_PREFIX}/agent-tools/contacts`,
    limits: `${API_PREFIX}/agent-tools/limits`,
    history: `${API_PREFIX}/agent-tools/history`,
  },
} as const
