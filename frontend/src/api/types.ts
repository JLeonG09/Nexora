/**
 * Tipos del dominio Nexora.
 *
 * Reflejan 1:1 los records de `dtos/responses` y `dtos/requests` del
 * backend (`com.nexora`). Si cambias un campo aqui, cambialo en el
 * DTO de Java: no hay generador de tipos entre los dos.
 *
 * Convenciones heredadas del backend:
 *  - Los ids son UUID en string.
 *  - Los montos son SIEMPRE string decimal ("15.0000000"), nunca number:
 *    nunca se pierden precisión ni se hacen cuentas en el navegador.
 *  - Los enums viajan como su nombre en mayusculas.
 */

/* ================================================================== */
/* Salud                                                              */
/* ================================================================== */

export interface Health {
  status: string
  aiMode: 'mock' | 'http' | 'local' | 'hybrid'
  signerMode: 'mock' | 'http'
  network: string
}

/* ================================================================== */
/* Usuario y cuenta                                                   */
/* ================================================================== */

export interface User {
  id: string
  displayName: string
  email: string
  createdAt: string
}

export interface CreateUserInput {
  displayName: string
  email: string
}

/** Smart account del usuario en Stellar. */
export interface Account {
  id: string
  userId: string
  smartAccountAddress: string
  credentialId: string | null
  network: string
  explorerUrl: string | null
  createdAt: string
}

export interface RegisterAccountInput {
  smartAccountAddress: string
  credentialId?: string
  network: string
}

/** Llave del agente para la version vigente de la smart account. */
export interface AgentKey {
  smartAccountAddress: string
  keyVersion: number
  publicKeyHex: string
  address: string
  ed25519VerifierAddress: string
}

/* ================================================================== */
/* Contactos                                                          */
/* ================================================================== */

/**
 * Un destinatario autorizado. El backend nunca toma la direccion del
 * mensaje de la IA: siempre sale de esta lista.
 */
export interface Contact {
  id: string
  name: string
  stellarAddress: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface ContactInput {
  name: string
  stellarAddress: string
  note?: string
}

/* ================================================================== */
/* Mandato                                                            */
/* ================================================================== */

export type MandateStatus = 'ACTIVO' | 'REVOCADO' | 'EXPIRADO'

export type RevokeReason = 'USUARIO' | 'LLAVE_COMPROMETIDA'

/**
 * El permiso que le da el usuario al agente: tope diario, tope por pago y
 * umbral desde el que pide confirmacion. Es lo que hace que el agente pueda
 * firmar sin preguntar en cada pago.
 */
export interface Mandate {
  id: string
  accountId: string
  dailyLimit: string
  perTxLimit: string
  approvalThreshold: string
  asset: string
  assetContractId: string | null
  expiresAt: string
  status: MandateStatus
  keyVersion: number
  agentPublicKeyHex: string
  contextRuleId: number
  validUntilLedger: number
  createTxHash: string | null
  revokeTxHash: string | null
  revokeReason: RevokeReason | null
  revokedAt: string | null
  createdAt: string
  /** Frase que el backend ya redacto para explicar el mandato en humano. */
  summary: string
}

export interface CreateMandateInput {
  dailyLimit: string
  perTxLimit: string
  approvalThreshold: string
  asset: string
  expiresAt: string
  contextRuleId: number
  validUntilLedger: number
  createTxHash: string
  keyVersion: number
  agentPublicKeyHex: string
}

/** Topes vigentes, para mostrarlos sin recalcularlos en el navegador. */
export interface Limits {
  mandateId: string | null
  asset: string | null
  dailyLimit: string | null
  spentLast24h: string | null
  availableLast24h: string | null
  perTxLimit: string | null
  approvalThreshold: string | null
  expiresAt: string | null
  status: MandateStatus | null
}

/** Cuando no hay mandato, el backend responde con este marcador. */
export const SIN_MANDATO = 'SIN_MANDATO'

/* ================================================================== */
/* Chat                                                               */
/* ================================================================== */

export type ChatRole = 'USUARIO' | 'AGENTE'

export type ChatMessageType = 'MESSAGE' | 'PROPOSAL'

export interface ChatMessage {
  id: string
  role: ChatRole
  type: ChatMessageType
  text: string
  proposalId: string | null
  createdAt: string
}

/** Elemento de `GET /chat/conversations`. `title` es el primer mensaje del usuario. */
export interface ConversationSummary {
  conversationId: string
  title: string
  startedAt: string
  lastMessageAt: string
  messageCount: number
}

export interface ChatReply {
  id: string
  role: ChatRole
  type: ChatMessageType
  text: string
  createdAt: string
}

/** La propuesta tal como la ve el chat: sin los campos internos. */
export interface ProposalSummary {
  id: string
  status: ProposalStatus
  contactId: string | null
  contactName: string | null
  amount: string | null
  asset: string
  memo: string | null
  txHash: string | null
  explorerUrl: string | null
  rejectionCode: string | null
  rejectionMessage: string | null
  approvalId: string | null
}

export interface ChatResponse {
  conversationId: string
  reply: ChatReply
  proposal: ProposalSummary | null
}

/* ================================================================== */
/* Propuestas de pago                                                 */
/* ================================================================== */

export type ProposalStatus =
  | 'PROPUESTO'
  | 'RECHAZADO'
  | 'PENDIENTE_APROBACION'
  | 'APROBADO'
  | 'ENVIADO'
  | 'CONFIRMADO'
  | 'FALLIDO'

/** Motivos por los que el backend puede rechazar un pago. */
export type RejectionCode =
  | 'ESQUEMA_INVALIDO'
  | 'ACTIVO_NO_PERMITIDO'
  | 'CONFIANZA_BAJA'
  | 'CAMPO_NO_FUNDAMENTADO'
  | 'CONTACTO_NO_ENCONTRADO'
  | 'CONTACTO_AMBIGUO'
  | 'MONTO_NO_EN_TEXTO'
  | 'MONTO_AMBIGUO'
  | 'INTENCION_NEGADA'
  | 'SIN_MANDATO_ACTIVO'
  | 'MANDATO_EXPIRADO'
  | 'SUPERA_TOPE_TRANSACCION'
  | 'SUPERA_TOPE_DIARIO'
  | 'LIMITE_FRECUENCIA'
  | 'RECHAZADO_POR_USUARIO'
  | 'APROBACION_EXPIRADA'
  | 'MANDATO_REVOCADO'

/**
 * Saldos ficticios antes y después del pago: la cuenta del usuario empieza
 * con 100 y cada contacto con 0. No existe nada de esto en Stellar.
 */
export interface SimulatedTransfer {
  asset: string
  fromAddress: string | null
  fromBefore: string
  fromAfter: string
  toName: string | null
  toAddress: string | null
  toBefore: string
  toAfter: string
}

export interface Proposal {
  id: string
  status: ProposalStatus
  originalText: string
  contactId: string | null
  contactName: string | null
  destinationAddress: string | null
  amount: string | null
  asset: string
  memo: string | null
  /** Confianza de la IA, de 0 a 1. El backend exige >= 0.7. */
  aiConfidence: number | null
  mandateId: string | null
  approvalId: string | null
  txHash: string | null
  explorerUrl: string | null
  rejectionCode: string | null
  rejectionMessage: string | null
  createdAt: string
  updatedAt: string
  /**
   * Solo con el firmante simulado, en estado CONFIRMADO y al pedir una
   * propuesta por id; la lista lo manda a null.
   */
  simulatedTransfer?: SimulatedTransfer | null
  /**
   * OJO: estos tres campos NO son parte de `ProposalResponse`.
   *
   * `sentAt` y `confirmedAt` llegan por `HistoryItemResponse`, y las reglas
   * que pasaron no las envia nadie. El backend solo expone el resultado
   * (`rejectionCode` / `rejectionMessage`), asi que se declaran aqui porque el
   * mock los necesita para que las dos pantallas se vean igual; contra el
   * backend real llegan sin ellos y la interfaz ya no depende de que existan.
   *
   * Lo comprobar `scripts/check-contrato.mts`, que salta a proposito los
   * campos que el backend no manda.
   */
  sentAt?: string | null
  confirmedAt?: string | null
  checks?: string[]
}

/* ================================================================== */
/* Aprobaciones                                                       */
/* ================================================================== */

export type ApprovalStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EXPIRADA'

/** Un pago que supero el umbral y espera que el usuario lo confirme. */
export interface Approval {
  id: string
  status: ApprovalStatus
  reason: string | null
  expiresAt: string
  createdAt: string
  decidedAt: string | null
  proposal: {
    id: string
    status: ProposalStatus
    contactName: string | null
    amount: string | null
    asset: string
    memo: string | null
    originalText: string
  } | null
}

export interface ApprovalDecision {
  id: string
  status: ApprovalStatus
  decidedAt: string | null
  proposal: {
    id: string
    status: ProposalStatus
    txHash: string | null
    explorerUrl: string | null
    rejectionCode: string | null
    rejectionMessage: string | null
  } | null
}

/* ================================================================== */
/* Alertas: pagos que el agente no hizo                               */
/* ================================================================== */

export type AlertStatus = 'PENDIENTE' | 'RECONOCIDA' | 'REPORTADA'

/**
 * Un movimiento de USDC que salio de la smart account sin que el agente lo
 * pidiera. Si el usuario lo reporta, el backend revoca el mandato y rota la
 * llave: la vieja queda inutil.
 */
export interface Alert {
  id: string
  status: AlertStatus
  txHash: string | null
  ledger: number | null
  destinationAddress: string | null
  amount: string | null
  asset: string
  occurredAt: string
  detectedAt: string
  explorerUrl: string | null
  mandateId: string | null
  /** Texto que el backend redacto para el usuario. */
  message: string
  decidedAt: string | null
}

export interface ReportAlertResponse {
  id: string
  status: AlertStatus
  decidedAt: string | null
  mandate: {
    id: string
    status: MandateStatus
    revokeReason: RevokeReason | null
    contextRuleId: number | null
    revokeTxHash: string | null
  } | null
  newKeyVersion: number
  /** Que tiene que hacer el usuario ahora en la cadena. */
  nextStep: string
}

/* ================================================================== */
/* Historial y auditoria                                              */
/* ================================================================== */

export type ApprovedBy = 'AUTOMATICO' | 'USUARIO'

export interface HistoryItem {
  proposalId: string
  status: ProposalStatus
  contactName: string | null
  destinationAddress: string | null
  amount: string | null
  asset: string
  memo: string | null
  txHash: string | null
  explorerUrl: string | null
  approvedBy: ApprovedBy | null
  sentAt: string | null
  confirmedAt: string | null
}

export type AuditActor = 'USUARIO' | 'IA' | 'BACKEND' | 'FIRMANTE' | 'RED'

export type AuditEventType =
  | 'USUARIO_CREADO'
  | 'CUENTA_REGISTRADA'
  | 'MANDATO_CREADO'
  | 'MANDATO_REVOCADO'
  | 'CONTACTO_CREADO'
  | 'CONTACTO_EDITADO'
  | 'CONTACTO_ARCHIVADO'
  | 'CHAT_RECIBIDO'
  | 'IA_RESPUESTA'
  | 'IA_ERROR'
  | 'PROPUESTA_CREADA'
  | 'VALIDACION_OK'
  | 'VALIDACION_RECHAZADA'
  | 'APROBACION_SOLICITADA'
  | 'APROBACION_APROBADA'
  | 'APROBACION_RECHAZADA'
  | 'APROBACION_EXPIRADA'
  | 'FIRMA_SOLICITADA'
  | 'TX_CONFIRMADA'
  | 'TX_FALLIDA'
  | 'ATAQUE_DEMO'
  | 'LLAVE_ROTADA'
  | 'MOVIMIENTO_NO_RECONOCIDO'
  | 'ALERTA_CONFIRMADA'
  | 'LLAVE_COMPROMETIDA'

export interface AuditEvent {
  id: string
  occurredAt: string
  eventType: AuditEventType
  actor: AuditActor
  proposalId: string | null
  mandateId: string | null
  summary: string
  data: Record<string, unknown> | null
}

/* ================================================================== */
/* Demo: llave robada                                                 */
/* ================================================================== */

export interface AttackDemoResponse {
  proposalId: string
  status: ProposalStatus
  txHash: string | null
  error: {
    code: string | null
    contractCode: number | null
    stage: string | null
    message: string | null
  } | null
}

export interface AttackDemoInput {
  destinationAddress: string
  amount: string
}

/* ================================================================== */
/* Errores                                                            */
/* ================================================================== */

export interface FieldError {
  field: string
  message: string
}

/**
 * Codigos de error del manejador global (`ErrorCode`). Son distintos de los
 * `RejectionCode`: estos son fallos de la PETICION (no se pudo validar,
 * falta la cabecera, hay conflicto), no decisiones sobre un pago.
 */
export type ApiErrorCode =
  | 'VALIDACION_FALLIDA'
  | 'USUARIO_NO_IDENTIFICADO'
  | 'CLAVE_SERVICIO_INVALIDA'
  | 'RECURSO_NO_ENCONTRADO'
  | 'CUENTA_YA_REGISTRADA'
  | 'MANDATO_ACTIVO_EXISTENTE'
  | 'SIN_MANDATO_ACTIVO'
  | 'SIN_CUENTA'
  | 'ESTADO_INVALIDO'
  | 'CONTACTO_DUPLICADO'
  | 'LLAVE_DESACTUALIZADA'
  | 'LIMITE_FRECUENCIA'
  | 'IA_NO_DISPONIBLE'
  | 'FIRMANTE_NO_DISPONIBLE'
  | 'ERROR_INTERNO'

/**
 * Formato unico de error del backend. El `code` es estable y se puede usar
 * para decidir; el `message` ya viene en espanol para mostrarlo.
 */
export interface ApiErrorBody {
  timestamp: string
  status: number
  code: string
  message: string
  path: string
  details: FieldError[] | null
  traceId: string | null
}

/* ================================================================== */
/* Paginacion                                                        */
/* ================================================================== */

/** OJO: el backend usa `items`/`totalItems`, no `content`/`totalElements`. */
export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalItems: number
}
