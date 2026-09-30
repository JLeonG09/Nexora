/**
 * Capa de recursos: una funcion tipada por endpoint.
 *
 * Las paginas nunca llaman a `http.get` directamente, siempre a algo de aqui.
 * Ventaja: si el backend cambia la forma de una respuesta, se arregla en un
 * unico archivo y no se buscan 20 componentes.
 *
 * Cada funcion devuelve el record del DTO de Java con su tipo exacto, para
 * que un cambio en el backend senote como error de TypeScript y no como
 * `undefined` en pantalla.
 */

import { http } from './client'
import { endpoints } from './endpoints'
import type { PageParams } from './endpoints'
import type {
  Account,
  AgentKey,
  Alert,
  AlertStatus,
  Approval,
  ApprovalDecision,
  ApprovalStatus,
  AttackDemoInput,
  AttackDemoResponse,
  AuditEvent,
  ChatMessage,
  ChatResponse,
  Contact,
  ContactInput,
  CreateMandateInput,
  CreateUserInput,
  Health,
  HistoryItem,
  Limits,
  Mandate,
  Page,
  Proposal,
  ProposalStatus,
  RegisterAccountInput,
  ReportAlertResponse,
  User,
} from './types'

/* --- Salud --------------------------------------------------------- */

/**
 * Unica llamada sin `X-User-Id`. Se usa en el LED de conexion de la barra
 * lateral: `status` mas `signerMode` bastan para saber si el backend puede
 * firmar de verdad o esta en modo simulado.
 */
export const health = {
  check: () => http.get<Health>(endpoints.health()),
}

/* --- Usuario y cuenta ---------------------------------------------- */

/**
 * `POST /api/users` es la CREACION de la sesion: no hay login. Devuelve el
 * usuario con su id, que es lo que pasa a ser la credencial (`X-User-Id`).
 */
export const users = {
  create: (payload: CreateUserInput) => http.post<User>(endpoints.createUser(), payload),
  /** Usuario del `X-User-Id` actual. Primera llamada al montar la app. */
  me: () => http.get<User>(endpoints.me()),
}

/**
 * La smart account es un contrato en Stellar que el usuario despliega fuera.
 * El panel solo la REGISTRA contra el backend; nunca genera ni firma con
 * sus claves.
 */
export const accounts = {
  register: (payload: RegisterAccountInput) => http.post<Account>(endpoints.createAccount(), payload),
  mine: () => http.get<Account>(endpoints.myAccount()),
  /** Llave publica que se authorizes como agente en el contrato. */
  agentKey: () => http.get<AgentKey>(endpoints.agentPublicKey()),
}

/* --- Contactos ------------------------------------------------------ */

/**
 * Lista blanca de destinatarios. El backend rechaza cualquier pago a una
 * direccion que no este aqui (`CONTACTO_NO_ENCONTRADO`), aunque la IA la
 * haya entendido bien: por eso esta pagina es critica, no adorno.
 */
export const contacts = {
  list: (params?: PageParams) => http.get<Page<Contact>>(endpoints.contacts(params)),
  get: (id: string) => http.get<Contact>(endpoints.contact(id)),
  create: (payload: ContactInput) => http.post<Contact>(endpoints.contacts(), payload),
  update: (id: string, payload: ContactInput) => http.put<Contact>(endpoints.contact(id), payload),
  /** Archiva el contacto. El backend guarda la fila para el historial. */
  remove: (id: string) => http.delete<void>(endpoints.contact(id)),
}

/* --- Mandato ------------------------------------------------------- */

/**
 * El mandato es lo que autoriza al agente a firmar sin preguntar. Sus tres
 * topes (umbral, por transaccion, diario) son la promesa que se le hace al
 * usuario, asi que se muestran tal cual los devuelve el backend.
 */
export const mandates = {
  /** Crea el mandato a partir de una transaccion ya ejecutada en la cadena. */
  create: (payload: CreateMandateInput) => http.post<Mandate>(endpoints.createMandate(), payload),
  active: () => http.get<Mandate | null>(endpoints.activeMandate()),
  /** Topes vigentes, para pintar la barra de gasto del dia. */
  limits: () => http.get<Limits>(endpoints.activeLimits()),
  list: (params?: PageParams) => http.get<Page<Mandate>>(endpoints.mandates(params)),
  /** Revoca. El cuerpo es opcional: el backend acepta revocar sin hash. */
  revoke: (id: string, revokeTxHash?: string) =>
    http.post<Mandate>(
      endpoints.revokeMandate(id),
      revokeTxHash ? { revokeTxHash } : undefined,
    ),
}

/* --- Chat ----------------------------------------------------------- */

export const chat = {
  /**
   * Envia un mensaje en lenguaje natural ("paga 25 a Maria por la pizza").
   * La respuesta trae la frase del agente Y, si hubo propuesta de pago, el
   * `proposal` resumido con su estado.
   */
  send: (message: string, conversationId?: string | null) =>
    http.post<ChatResponse>(endpoints.sendChat(), { message, conversationId: conversationId ?? null }),
  messages: (conversationId?: string | null) =>
    http.get<ChatMessage[]>(endpoints.chatMessages(conversationId)),
}

/* --- Propuestas de pago --------------------------------------------- */

export const proposals = {
  list: (params: PageParams & { status?: ProposalStatus | null } = {}) =>
    http.get<Page<Proposal>>(endpoints.proposals(params)),
  get: (id: string) => http.get<Proposal>(endpoints.proposal(id)),
}

/* --- Aprobaciones --------------------------------------------------- */

/**
 * Bandeja de pagos que superaron el umbral del mandato. Aprobar revalida
 * los topes en el momento: si ya no pasan, el backend rechaza igual.
 */
export const approvals = {
  list: (params: PageParams & { status?: ApprovalStatus | null } = {}) =>
    http.get<Page<Approval>>(endpoints.approvals(params)),
  approve: (id: string) => http.post<ApprovalDecision>(endpoints.approve(id)),
  reject: (id: string, reason?: string) =>
    http.post<ApprovalDecision>(endpoints.reject(id), reason ? { reason } : undefined),
}

/* --- Alertas -------------------------------------------------------- */

/**
 * Un movimiento que salio de la smart account sin que el agente lo pidiera.
 * Es la unica defensa real del producto: confirma o reporta.
 */
export const alerts = {
  list: (params: PageParams & { status?: AlertStatus | null } = {}) =>
    http.get<Page<Alert>>(endpoints.alerts(params)),
  /** "Si fui yo": se cierra la alerta, el mandato sigue vivo. */
  confirm: (id: string) => http.post<Alert>(endpoints.confirmAlert(id)),
  /** "No fui yo": revoca mandato y rota llave. */
  report: (id: string) => http.post<ReportAlertResponse>(endpoints.reportAlert(id)),
}

/* --- Historial y auditoria ------------------------------------------ */

export const history = {
  list: (params?: PageParams) => http.get<Page<HistoryItem>>(endpoints.history(params)),
  audit: (params: PageParams & { proposalId?: string | null } = {}) =>
    http.get<Page<AuditEvent>>(endpoints.audit(params)),
}

/* --- Demo: atacante con la llave robada ----------------------------- */

/**
 * Simula un atacante que ya tiene una llave y salta al agente. No pide
 * confirmacion, asi que el unico freno posible es el contrato: si el ataque
 * se detiene, es porque el mandato lo detuvo, no porque la UI preguntara.
 */
export const demo = {
  runAttack: (payload: AttackDemoInput) =>
    http.post<AttackDemoResponse>(endpoints.runAttack(), payload),
}
