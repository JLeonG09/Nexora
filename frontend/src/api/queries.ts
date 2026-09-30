/**
 * Hooks de datos (TanStack Query) y claves de cache.
 *
 * Cada pantalla usa estos hooks en vez de llamar a la API a mano. Eso
 * concentra en un sitio tres cosas que si se repiten se olvidan:
 * la clave de cache (para invalidar bien), el `staleTime` (para no pedir lo
 * mismo cada vez que se cambia de pestana) y el `refetchInterval` (para los
 * pagos que el backend aun esta procesando).
 *
 * Convenciones:
 *  - Las claves van de mas general a mas concreta: `['approvals']` invalida
 *    tambien `['approvals', 'lista', ...]`.
 *  - `errorMessage` es el unico sitio que traduce un error a texto para el
 *    usuario. Las pantallas nunca miran `ApiError` a mano.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { ApiError, NetworkError } from './errors'
import {
  accounts,
  alerts,
  approvals,
  chat,
  contacts,
  demo,
  health,
  history,
  mandates,
  proposals,
  users,
} from './resources'
import type {
  AlertStatus,
  ApprovalStatus,
  AttackDemoInput,
  Contact,
  ContactInput,
  CreateMandateInput,
  CreateUserInput,
  ProposalStatus,
  RegisterAccountInput,
} from './types'

/* ------------------------------------------------------------------ */
/* Claves de cache                                                    */
/* ------------------------------------------------------------------ */

export const queryKeys = {
  health: ['health'] as const,
  me: ['me'] as const,
  account: ['account'] as const,
  agentKey: ['agent', 'public-key'] as const,
  contacts: ['contacts'] as const,
  contactList: (page: number) => ['contacts', 'lista', page] as const,
  mandateActive: ['mandates', 'active'] as const,
  limits: ['mandates', 'limits'] as const,
  chat: (conversationId: string | null) => ['chat', conversationId ?? 'ultima'] as const,
  proposals: (status: ProposalStatus | null, page: number) =>
    ['proposals', status ?? 'todos', page] as const,
  proposal: (id: string) => ['proposals', 'detalle', id] as const,
  approvals: (status: ApprovalStatus | null, page: number) =>
    ['approvals', status ?? 'todas', page] as const,
  alerts: (status: AlertStatus | null, page: number) => ['alerts', status ?? 'todas', page] as const,
  history: (page: number) => ['history', page] as const,
  audit: (proposalId: string | null, page: number) =>
    ['audit', proposalId ?? 'todos', page] as const,
} as const

/* ------------------------------------------------------------------ */
/* Salud y sesion                                                      */
/* ------------------------------------------------------------------ */

/**
 * Estado del backend. `refetchInterval` alto porque es solo para el LED de
 * conexion: si el backend se cae, la pantalla entera deja de poder hacer
 * nada y hay que enterarse rapido.
 */
export function useHealth(): UseQueryResult<Awaited<ReturnType<typeof health.check>>, Error> {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: health.check,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}

/* ------------------------------------------------------------------ */
/* Contactos                                                          */
/* ------------------------------------------------------------------ */

/**
 * Los contactos se piden casi siempre enteros (son pocos y el panel entero
 * depende de ellos), asi que se pide la primera pagina grande y se filtra en
 * memoria. Si algún día son cientos, se cambia por paginacion real.
 */
export function useContactos(): UseQueryResult<Contact[], Error> {
  return useQuery({
    queryKey: [...queryKeys.contacts, 'todos'],
    queryFn: async () => (await contacts.list({ size: 100 })).items,
    staleTime: 30_000,
  })
}

export function useCrearContacto(): UseMutationResult<Contact, Error, ContactInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ContactInput) => contacts.create(input),
    // La IA valida contra esta lista: si el cache no se invalida, el chat
    // seguiria diciendo "contacto no encontrado" despues de anadirlo.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
    },
  })
}

export function useActualizarContacto(id: string): UseMutationResult<Contact, Error, ContactInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ContactInput) => contacts.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
    },
  })
}

/** Borrar en el backend es ARCHIVAR: la fila se conserva para el historial. */
export function useArchivarContacto(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => contacts.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Mandato                                                            */
/* ------------------------------------------------------------------ */

/** Mandato vigente, o `null` si no hay ninguno o ya vencio. */
export function useMandatoActivo() {
  return useQuery({
    queryKey: queryKeys.mandateActive,
    queryFn: mandates.active,
    staleTime: 15_000,
  })
}

/**
 * Topes del dia. Se refresca seguido porque es la barra que dice "cuanto
 * te queda hoy": si el agente acaba de pagar, tiene que bajar ya.
 */
export function useLimites() {
  return useQuery({
    queryKey: queryKeys.limits,
    queryFn: mandates.limits,
    staleTime: 10_000,
  })
}

/** Llave publica del agente, para instalarla en la regla on-chain. */
export function useLlaveAgente() {
  return useQuery({
    queryKey: queryKeys.agentKey,
    queryFn: accounts.agentKey,
    // La version de llave cambia solo al revocar. No tiene sentido volver a preguntar.
    staleTime: 5 * 60_000,
  })
}

export function useCrearMandato(): UseMutationResult<
  Awaited<ReturnType<typeof mandates.create>>,
  Error,
  CreateMandateInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMandateInput) => mandates.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mandates'] })
    },
  })
}

export function useRevocarMandato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, revokeTxHash }: { id: string; revokeTxHash?: string }) =>
      mandates.revoke(id, revokeTxHash),
    // Revocar rotaciona la llave, asi que la llave cacheada ya no vale.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mandates'] })
      void qc.invalidateQueries({ queryKey: queryKeys.agentKey })
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['proposals'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Chat                                                               */
/* ------------------------------------------------------------------ */

/**
 * Historial del chat. No se refetchea solo: el mensaje se añade de forma
 * optimista y el backend lo devuelve ya guardado, asi que volver a preguntar en cada
 * mensaje solo genera tráfico.
 */
export function useChat(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat(conversationId),
    queryFn: () => chat.messages(conversationId),
    staleTime: 30_000,
  })
}

/**
 * Envia un mensaje. Al exito invalida la lista de mensajes y, si el mensaje
 * genero una propuesta, tambien el historial de pagos.
 */
export function useEnviarMensaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ message, conversationId }: { message: string; conversationId: string | null }) =>
      chat.send(message, conversationId),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chat(variables.conversationId) })
      void qc.invalidateQueries({ queryKey: ['proposals'] })
      void qc.invalidateQueries({ queryKey: queryKeys.mandateActive })
      void qc.invalidateQueries({ queryKey: queryKeys.limits })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Propuestas                                                         */
/* ------------------------------------------------------------------ */

export function usePropuestas(status: ProposalStatus | null, page: number, size = 20) {
  return useQuery({
    queryKey: queryKeys.proposals(status, page),
    queryFn: () => proposals.list({ status, page, size }),
    staleTime: 15_000,
  })
}

/**
 * Detalle de UNA propuesta.
 *
 * El chat solo recibe el resumen (`ChatProposalResponse`). Cuando ese resumen
 * trae un `rejectionCode`, el resumen no lleva el detalle de por que fallo ni
 * las reglas que se evaluaron: hace falta el objeto completo, asi que se pide
 * aqui y no en la respuesta del chat.
 */
export function usePropuesta(id: string | null) {
  return useQuery({
    queryKey: queryKeys.proposal(id ?? 'ninguna'),
    queryFn: () => proposals.get(id as string),
    enabled: id !== null,
    staleTime: 10_000,
  })
}

/* ------------------------------------------------------------------ */
/* Aprobaciones                                                       */
/* ------------------------------------------------------------------ */

/**
 * Refetch cada 15 s: una aprobacion expira sola (`APROVAL_EXPIRY_INTERVAL_MS`,
 * 60 s por defecto en el backend) y el usuario tiene que enterarse sin
 * recargar la pagina.
 */
export function useAprobaciones(status: ApprovalStatus | null, page: number, size = 20) {
  return useQuery({
    queryKey: queryKeys.approvals(status, page),
    queryFn: () => approvals.list({ status, page, size }),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function useAprobar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approvals.approve(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['proposals'] })
      void qc.invalidateQueries({ queryKey: queryKeys.limits })
      void qc.invalidateQueries({ queryKey: ['history'] })
    },
  })
}

export function useRechazar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => approvals.reject(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['proposals'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Alertas                                                            */
/* ------------------------------------------------------------------ */

/** Refetch cada 20 s: el detector de conciliacion corre cada 60 s. */
export function useAlertas(status: AlertStatus | null, page: number, size = 20) {
  return useQuery({
    queryKey: queryKeys.alerts(status, page),
    queryFn: () => alerts.list({ status, page, size }),
    staleTime: 10_000,
    refetchInterval: 20_000,
  })
}

export function useConfirmarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => alerts.confirm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

/** Reportar revoca el mandato y rota la llave: invalida casi todo. */
export function useReportarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => alerts.report(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] })
      void qc.invalidateQueries({ queryKey: ['mandates'] })
      void qc.invalidateQueries({ queryKey: queryKeys.agentKey })
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['proposals'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Historial y auditoria                                              */
/* ------------------------------------------------------------------ */

export function useHistorial(page: number, size = 20) {
  return useQuery({
    queryKey: queryKeys.history(page),
    queryFn: () => history.list({ page, size }),
    staleTime: 15_000,
  })
}

export function useAuditoria(proposalId: string | null, page: number, size = 50) {
  return useQuery({
    queryKey: queryKeys.audit(proposalId, page),
    queryFn: () => history.audit({ proposalId, page, size }),
    staleTime: 15_000,
  })
}

/* ------------------------------------------------------------------ */
/* Alta y cuenta                                                      */
/* ------------------------------------------------------------------ */

export function useCrearUsuario(): UseMutationResult<
  Awaited<ReturnType<typeof users.create>>,
  Error,
  CreateUserInput
> {
  return useMutation({ mutationFn: (input: CreateUserInput) => users.create(input) })
}

export function useRegistrarCuenta(): UseMutationResult<
  Awaited<ReturnType<typeof accounts.register>>,
  Error,
  RegisterAccountInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterAccountInput) => accounts.register(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.account })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Demo: llave robada                                                 */
/* ------------------------------------------------------------------ */

export function useDemoAtaque() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AttackDemoInput) => demo.runAttack(input),
    onSuccess: () => {
      // El ataque no pasa por el chat, asi que no ensucia la conversacion,
      // pero si puede acabar generando una alerta.
      void qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Errores                                                            */
/* ------------------------------------------------------------------ */

/**
 * Traduce cualquier error a un mensaje en espanol que se pueda mostrar.
 *
 * El backend ya manda el texto en espanol (`ErrorCode.defaultMessage` y los
 * `rejectionMessage`), asi que casi siempre gana su mensaje. Los overrides
 * de aqui son solo para los errores que el navegador produce y el backend
 * no ve: no hay red, se caio la conexion, se cancelo la peticion.
 */
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error

  if (error instanceof ApiError) {
    if (error.isUnauthorized) return 'Tu sesión no es válida. Vuelve a registrarte.'
    if (error.isServer) return 'El servicio no está disponible. Intenta en unos segundos.'
    return error.displayMessage
  }

  if (error instanceof NetworkError) return error.message

  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'Se canceló la petición.'
    return error.message
  }

  return 'Ocurrió un error inesperado.'
}
