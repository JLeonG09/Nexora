/**
 * Router del backend simulado.
 *
 * `client.ts` enruta aqui todas las peticiones cuando `VITE_MOCK=true`, asi
 * que la app se puede usar sin PostgreSQL, sin IA y sin firmante. El
 * resultado tiene la MISMA forma que los DTOs de Java, y las reglas se
 * ejecutan de verdad (`reglas.ts`): si el pago supera el tope diario, aqui se
 * rechaza.
 *
 * Latencia simulada: 180-420 ms. No es decorado, sirve para que los estados
 * de carga se vean y para que dos peticiones simultaneas no se mezclen.
 */

import { API_PREFIX } from '@/config/env'
import type {
  Account,
  Approval,
  ApprovalDecision,
  AttackDemoResponse,
  ChatMessage,
  ChatResponse,
  Contact,
  Health,
  HistoryItem,
  Limits,
  Mandate,
  Page,
  Proposal,
  ProposalSummary,
  User,
} from '../types'
import {
  ahora,
  auditar,
  conciliar,
  direccion,
  enHoras,
  estado,
  formatoMonto,
  hashTx,
  claveHex,
  mandatoActivo,
  redondear,
  reiniciar,
  uuid,
  TOPE_ONCHAIN_24H,
} from './estado'
import { ErrorIa, interpretar, validar, type RespuestaIa } from './reglas'

/* ------------------------------------------------------------------ */
/* Error del backend simulado                                         */
/* ------------------------------------------------------------------ */

export class MockHttpError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'MockHttpError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

function noEncontrado(que = 'Lo que buscas'): never {
  throw new MockHttpError(404, 'RECURSO_NO_ENCONTRADO', `${que} no existe.`)
}

function sinSesion(): never {
  throw new MockHttpError(
    401,
    'USUARIO_NO_IDENTIFICADO',
    'No pudimos identificar al usuario. Crea un usuario o vuelve a iniciar.',
  )
}

function conflicto(code: string, message: string): never {
  throw new MockHttpError(409, code, message)
}

/**
 * Lanza el `MockHttpError` de validacion si hay campos con error.
 *
 * Se llama al principio de cada mutacion, pasando un mapa `campo -> mensaje`
 * construido a mano con los mismos textos que los `@NotBlank`/`@Pattern` del
 * DTO de Java. El `path` no se valida con regex aqui: los patrones exactos
 * estan en `resources.ts` documentados, y duplicarlos seria una fuente de
 * divergencia.
 */
function validarCampos(errores: Record<string, string>): void {
  if (Object.keys(errores).length === 0) return
  throw new MockHttpError(
    400,
    'VALIDACION_FALLIDA',
    'Hay datos inv\u00e1lidos en la solicitud.',
    errores,
  )
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Utilidades de respuesta                                            */
/* ------------------------------------------------------------------ */

function pagina<T>(items: T[], page: number, size: number): Page<T> {
  const inicio = page * size
  return {
    items: items.slice(inicio, inicio + size),
    page,
    size,
    totalItems: items.length,
  }
}

function queryParams(search: string): URLSearchParams {
  const qs = search.includes('?') ? search.slice(search.indexOf('?')) : ''
  return new URLSearchParams(qs)
}

function int(search: string, nombre: string, porDefecto: number): number {
  const bruto = queryParams(search).get(nombre)
  const n = bruto === null ? NaN : Number(bruto)
  return Number.isFinite(n) ? n : porDefecto
}

/* ------------------------------------------------------------------ */
/* Gasto de las ultimas 24 h                                          */
/* ------------------------------------------------------------------ */

/**
 * Suma de lo pagado con exito en la ventana movil de 24 h.
 *
 * Solo cuentan las propuestas que llegaron a la red: una propuesta
 * `PENDIENTE_APROBACION` todavia no ha gastado nada, y una `RECHAZADA` menos.
 * Es el mismo criterio que usa el backend con la fila bloqueada.
 */
function gastado24h(): number {
  const limite = Date.now() - 24 * 3600 * 1000
  return redondear(
    estado.propuestas
      .filter((p) => p.status === 'CONFIRMADO' || p.status === 'ENVIADO')
      .filter((p) => p.sentAt && new Date(p.sentAt).getTime() >= limite)
      .reduce((total, p) => total + Number(p.amount ?? 0), 0),
  )
}

function propuestasUltimos10Min(): number {
  const limite = Date.now() - 10 * 60 * 1000
  return estado.propuestas.filter(
    (p) => new Date(p.createdAt).getTime() >= limite,
  ).length
}

/* ------------------------------------------------------------------ */
/* Firmante simulado                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta el pago en la cadena.
 *
 * Aplica el tope on-chain del firmante simulado (50 USDC / 24 h, codigo de
 * contrato 3221) por encima de los topes del mandato. Es lo que permite que la
 * demo de la "llave robada" tenga sentido: un atacante puede gastar hasta ahi
 * sin pasar por el agente, y de ahi sale la alerta.
 *
 * Los marcadores `#firmante-*` se quedan en el memo porque es donde el
 * firmante simulado los lee, igual que en el backend.
 */
function firmarYEnviar(propuesta: Proposal): Proposal {
  const monto = Number(propuesta.amount ?? 0)
  const memo = propuesta.memo ?? ''

  if (/#firmante-caido\b/i.test(memo)) {
    // El firmante no responde: queda ENVIADO y lo resuelve la tarea programada.
    propuesta.status = 'ENVIADO'
    propuesta.sentAt = ahora()
    auditar('FIRMA_SOLICITADA', 'FIRMANTE', 'Pago enviado al firmante', {
      proposalId: propuesta.id,
      mandateId: propuesta.mandateId,
    })
    return propuesta
  }

  if (estado.gastadoOnchain24h + monto > TOPE_ONCHAIN_24H) {
    propuesta.status = 'FALLIDO'
    propuesta.rejectionCode = 'TOPE_ONCHAIN'
    propuesta.rejectionMessage = `El contrato rechaz\u00f3 el pago: se super\u00f3 el tope on-chain de ${TOPE_ONCHAIN_24H} USDC en 24 horas (c\u00f3digo 3221).`
    propuesta.updatedAt = ahora()
    auditar('TX_FALLIDA', 'FIRMANTE', 'La cadena rechaz\u00f3 el pago por tope on-chain', {
      proposalId: propuesta.id,
      mandateId: propuesta.mandateId,
      data: { contractCode: 3221, tope: TOPE_ONCHAIN_24H },
    })
    return propuesta
  }

  const tx = hashTx()
  propuesta.txHash = tx
  propuesta.explorerUrl = `https://stellar.expert/explorer/testnet/tx/${tx}`
  propuesta.sentAt = ahora()

  if (/#firmante-lento\b/i.test(memo)) {
    // El firmante acepta pero la transaccion queda pendiente de un ledger.
    propuesta.status = 'ENVIADO'
    propuesta.updatedAt = ahora()
    auditar('FIRMA_SOLICITADA', 'FIRMANTE', 'Pago enviado al firmante', {
      proposalId: propuesta.id,
      mandateId: propuesta.mandateId,
    })
    return propuesta
  }

  propuesta.status = 'CONFIRMADO'
  propuesta.confirmedAt = ahora()
  propuesta.updatedAt = ahora()
  estado.gastadoOnchain24h = redondear(estado.gastadoOnchain24h + monto)
  // Es un pago que hizo el agente: el detector de conciliacion lo ignora.
  estado.pagosDelChat.add(tx)
  estado.ledger += 1
  auditar('TX_CONFIRMADA', 'RED', 'Pago confirmado en la red', {
    proposalId: propuesta.id,
    mandateId: propuesta.mandateId,
    data: { txHash: tx, monto: propuesta.amount },
  })
  return propuesta
}

/**
 * Tarea programada: resuelve los pagos que quedaron `ENVIADO`.
 *
 * El backend lo hace `ScheduledJobs` con `SENT_POLL_INTERVAL_MS=10000`. Aqui
 * se ejecuta al leer, que es cuando el panel hace polling: el efecto para el
 * usuario es el mismo y no hace falta un temporizador.
 */
function resolverEnvios(): void {
  for (const propuesta of estado.propuestas) {
    if (propuesta.status !== 'ENVIADO') continue
    if (!propuesta.sentAt) continue
    // Se espera un poco para que el estado ENVIADO sea visible al menos una vez.
    if (Date.now() - new Date(propuesta.sentAt).getTime() < 1200) continue

    const memo = propuesta.memo ?? ''
    if (/#firmante-caido\b/i.test(memo)) {
      propuesta.status = 'FALLIDO'
      propuesta.rejectionCode = 'FIRMANTE_NO_DISPONIBLE'
      propuesta.rejectionMessage = 'El servicio de firma no respondi\u00f3 y el pago se cancel\u00f3.'
    } else {
      const monto = Number(propuesta.amount ?? 0)
      propuesta.status = 'CONFIRMADO'
      propuesta.confirmedAt = ahora()
      estado.gastadoOnchain24h = redondear(estado.gastadoOnchain24h + monto)
      if (propuesta.txHash) estado.pagosDelChat.add(propuesta.txHash)
    }
    propuesta.updatedAt = ahora()
  }
}

/* ------------------------------------------------------------------ */
/* Respuestas con forma de DTO                                        */
/* ------------------------------------------------------------------ */

function aMandateResponse(m: Mandate): Mandate {
  return {
    ...m,
    dailyLimit: formatoMonto(Number(m.dailyLimit)),
    perTxLimit: formatoMonto(Number(m.perTxLimit)),
    approvalThreshold: formatoMonto(Number(m.approvalThreshold)),
    summary: resumenMandato(m),
  }
}

/** Redacta la frase que el backend compone para explicar el mandato. */
function resumenMandato(m: Mandate): string {
  const umbral = Number(m.approvalThreshold)
  const porTx = Number(m.perTxLimit)
  const diario = Number(m.dailyLimit)
  return (
    `Puede pagar hasta ${umbral} USDC sin preguntarte, hasta ${porTx} USDC por pago con tu ` +
    `aprobaci\u00f3n y ${diario} USDC en 24 horas, solo a tus contactos, hasta el ` +
    `${new Date(m.expiresAt).toLocaleDateString('es-ES')}.`
  )
}

function aLimitsResponse(): Limits {
  const m = mandatoActivo()
  if (!m) {
    return {
      mandateId: null,
      asset: null,
      dailyLimit: null,
      spentLast24h: null,
      availableLast24h: null,
      perTxLimit: null,
      approvalThreshold: null,
      expiresAt: null,
      status: null,
    }
  }
  const diario = Number(m.dailyLimit)
  const gastado = gastado24h()
  return {
    mandateId: m.id,
    asset: m.asset,
    dailyLimit: formatoMonto(diario),
    spentLast24h: formatoMonto(gastado),
    availableLast24h: formatoMonto(Math.max(diario - gastado, 0)),
    perTxLimit: m.perTxLimit,
    approvalThreshold: m.approvalThreshold,
    expiresAt: m.expiresAt,
    status: m.status,
  }
}

function aProposalSummary(p: Proposal): ProposalSummary {
  const aprobacion = estado.aprobaciones.find((a) => a.proposal?.id === p.id)
  return {
    id: p.id,
    status: p.status,
    contactId: p.contactId,
    contactName: p.contactName,
    amount: p.amount,
    asset: p.asset,
    memo: p.memo,
    txHash: p.txHash,
    explorerUrl: p.explorerUrl,
    rejectionCode: p.rejectionCode,
    rejectionMessage: p.rejectionMessage,
    approvalId: aprobacion?.id ?? null,
  }
}

/* ------------------------------------------------------------------ */
/* Peticion                                                           */
/* ------------------------------------------------------------------ */

export interface ResultadoMock {
  body: unknown
  status: number
}

/**
 * Atiende una peticion contra el estado en memoria.
 *
 * `path` es la ruta completa tal cual la construye `endpoints.ts`, incluido
 * `API_PREFIX` y el query string.
 */
export async function mockRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<ResultadoMock> {
  await dormir(180 + Math.random() * 240)

  const verbo = method.toUpperCase()
  const relativa = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path
  const ruta = relativa.split('?')[0] || '/'
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : ''

  const datos = (body ?? {}) as Record<string, unknown>

  /* --- Salud: la unica ruta sin usuario --------------------------- */
  if (verbo === 'GET' && ruta === '/health') {
    const payload: Health = {
      status: 'UP',
      aiMode: 'mock',
      signerMode: 'mock',
      network: 'TESTNET',
    }
    return ok(payload)
  }

  /* --- Modo especial de la demo: reiniciar todo ------------------- */
  if (verbo === 'POST' && ruta === '/demo/reset') {
    reiniciar()
    return ok({ ok: true })
  }

  /* --- Usuario ---------------------------------------------------- */
  if (verbo === 'POST' && ruta === '/users') {
    const nombre = String(datos.displayName ?? '').trim()
    const correo = String(datos.email ?? '').trim()
    const errores: Record<string, string> = {}
    if (!nombre) errores.displayName = 'El nombre es obligatorio.'
    else if (nombre.length > 60) errores.displayName = 'El nombre no puede tener m\u00e1s de 60 caracteres.'
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      errores.email = 'El correo no es v\u00e1lido.'
    }
    validarCampos(errores)

    const usuario: User = {
      id: uuid(),
      displayName: nombre || 'Usuario',
      email: correo || 'sin-correo@local',
      createdAt: ahora(),
    }
    estado.usuario = usuario
    auditar('USUARIO_CREADO', 'USUARIO', `Usuario creado: ${usuario.displayName}`)
    return ok(usuario, 201)
  }

  if (verbo === 'POST' && ruta === '/users/login') {
    const correo = String(datos.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      validarCampos({ email: 'El correo no es v\u00e1lido.' })
    }
    if (!estado.usuario || estado.usuario.email.toLowerCase() !== correo) {
      throw new MockHttpError(404, 'RECURSO_NO_ENCONTRADO', 'No hay ninguna cuenta con ese correo.', {
        email: 'No hay ninguna cuenta con ese correo.',
      })
    }
    return ok(estado.usuario)
  }

  if (!estado.usuario) sinSesion()
  const usuario = estado.usuario

  if (verbo === 'GET' && ruta === '/users/me') return ok(usuario)

  /* --- Smart account ---------------------------------------------- */
  if (verbo === 'POST' && ruta === '/accounts') {
    if (estado.cuenta) {
      conflicto('CUENTA_YA_REGISTRADA', 'Ya tienes una cuenta registrada o esa direcci\u00f3n ya est\u00e1 en uso.')
    }
    const dir = String(datos.smartAccountAddress ?? '').trim()
    const red = String(datos.network ?? 'TESTNET').trim()
    const errores: Record<string, string> = {}
    if (!/^C[A-Z2-7]{55}$/.test(dir)) {
      errores.smartAccountAddress =
        'La direcci\u00f3n debe empezar con C y tener 56 caracteres.'
    }
    if (red !== 'TESTNET') errores.network = 'Por ahora solo se admite la red TESTNET.'
    validarCampos(errores)

    const cuenta: Account = {
      id: uuid(),
      userId: usuario.id,
      smartAccountAddress: dir,
      credentialId: datos.credentialId ? String(datos.credentialId) : null,
      network: red,
      explorerUrl: `https://stellar.expert/explorer/testnet/contract/${dir}`,
      createdAt: ahora(),
    }
    estado.cuenta = cuenta
    auditar('CUENTA_REGISTRADA', 'USUARIO', 'Smart account registrada', {
      data: { smartAccountAddress: dir },
    })
    return ok(cuenta, 201)
  }

  if (verbo === 'GET' && ruta === '/accounts/me') {
    if (!estado.cuenta) noEncontrado('La smart account')
    return ok(estado.cuenta)
  }

  if (verbo === 'GET' && ruta === '/agent/public-key') {
    return ok({
      smartAccountAddress: estado.cuenta?.smartAccountAddress ?? null,
      keyVersion: estado.versionLlave,
      publicKeyHex: estado.claveAgenteHex,
      address: direccion('G'),
      ed25519VerifierAddress: direccion('C'),
    })
  }

  /* --- Contactos --------------------------------------------------- */
  if (ruta === '/contacts') {
    if (verbo === 'GET') {
      return ok(pagina(estado.contactos, int(search, 'page', 0), int(search, 'size', 50)))
    }
    if (verbo === 'POST') {
      const c = datos as { name?: unknown; stellarAddress?: unknown; note?: unknown }
      const nombre = String(c.name ?? '').trim()
      const dir = String(c.stellarAddress ?? '').trim().toUpperCase()
      const nota = c.note ? String(c.note).trim() : null
      const errores: Record<string, string> = {}
      if (!nombre) errores.name = 'El nombre es obligatorio.'
      else if (nombre.length > 40) errores.name = 'El nombre no puede tener m\u00e1s de 40 caracteres.'
      if (!/^[GC][A-Z2-7]{55}$/.test(dir)) {
        errores.stellarAddress =
          'La direcci\u00f3n debe empezar con G o C y tener 56 caracteres.'
      }
      if (nota && nota.length > 140) errores.note = 'La nota no puede tener m\u00e1s de 140 caracteres.'
      validarCampos(errores)

      const duplicado = estado.contactos.some(
        (x) => x.name.toUpperCase() === nombre.toUpperCase(),
      )
      if (duplicado) conflicto('CONTACTO_DUPLICADO', 'Ya tienes un contacto con ese nombre.')

      const contacto: Contact = {
        id: uuid(),
        name: nombre,
        stellarAddress: dir,
        note: nota,
        createdAt: ahora(),
        updatedAt: ahora(),
      }
      estado.contactos.push(contacto)
      auditar('CONTACTO_CREADO', 'USUARIO', `Contacto a\u00f1adido: ${nombre}`, {
        data: { stellarAddress: dir },
      })
      return ok(contacto, 201)
    }
  }

  const contactoId = ruta.match(/^\/contacts\/([^/]+)$/)
  if (contactoId) {
    const contacto = estado.contactos.find((c) => c.id === contactoId[1])
    if (!contacto) noEncontrado('El contacto')
    if (verbo === 'GET') return ok(contacto)
    if (verbo === 'PUT') {
      const c = datos as { name?: unknown; stellarAddress?: unknown; note?: unknown }
      const nombre = String(c.name ?? '').trim()
      const dir = String(c.stellarAddress ?? '').trim().toUpperCase()
      const errores: Record<string, string> = {}
      if (!nombre) errores.name = 'El nombre es obligatorio.'
      else if (nombre.length > 40) errores.name = 'El nombre no puede tener m\u00e1s de 40 caracteres.'
      if (!/^[GC][A-Z2-7]{55}$/.test(dir)) {
        errores.stellarAddress =
          'La direcci\u00f3n debe empezar con G o C y tener 56 caracteres.'
      }
      validarCampos(errores)

      contacto.name = nombre
      contacto.stellarAddress = dir
      contacto.note = c.note ? String(c.note).trim() : null
      contacto.updatedAt = ahora()
      auditar('CONTACTO_EDITADO', 'USUARIO', `Contacto editado: ${nombre}`)
      return ok(contacto)
    }
    if (verbo === 'DELETE') {
      // Borrar en Nexora es ARCHIVAR: la fila sigue para el historial.
      estado.contactos = estado.contactos.filter((c) => c.id !== contacto.id)
      auditar('CONTACTO_ARCHIVADO', 'USUARIO', `Contacto archivado: ${contacto.name}`)
      return ok(null, 204)
    }
  }

  /* --- Mandatos ---------------------------------------------------- */
  if (verbo === 'POST' && ruta === '/mandates') {
    if (!estado.cuenta) conflicto('SIN_CUENTA', 'Primero registra tu smart account.')
    if (mandatoActivo()) {
      conflicto('MANDATO_ACTIVO_EXISTENTE', 'Ya tienes un mandato activo. Rev\u00f3calo antes de crear otro.')
    }
    const m = datos as Record<string, unknown>
    const errores: Record<string, string> = {}
    const decimal = /^\d+(\.\d{1,7})?$/
    for (const campo of ['dailyLimit', 'perTxLimit', 'approvalThreshold']) {
      const valor = String(m[campo] ?? '')
      if (!valor) errores[campo] = 'El monto es obligatorio.'
      else if (!decimal.test(valor)) {
        errores[campo] = 'El monto debe ser un n\u00famero positivo con hasta 7 decimales.'
      }
    }
    if (m.asset !== 'USDC') errores.asset = 'Por ahora solo se admite USDC.'
    if (!m.expiresAt) errores.expiresAt = 'La fecha de expiraci\u00f3n es obligatoria.'
    if (!/^[0-9a-fA-F]{64}$/.test(String(m.createTxHash ?? ''))) {
      errores.createTxHash = 'El hash debe tener 64 caracteres hexadecimales.'
    }
    if (!/^[0-9a-fA-F]{64}$/.test(String(m.agentPublicKeyHex ?? ''))) {
      errores.agentPublicKeyHex = 'La llave p\u00fablica debe tener 64 caracteres hexadecimales.'
    }
    validarCampos(errores)

    // La llave del mandato tiene que ser la vigente, o el pago fallara luego.
    if (Number(m.keyVersion) !== estado.versionLlave || m.agentPublicKeyHex !== estado.claveAgenteHex) {
      conflicto(
        'LLAVE_DESACTUALIZADA',
        'La llave del agente cambi\u00f3. Pide la llave actual y vuelve a crear el mandato.',
      )
    }

    const mandato: Mandate = {
      id: uuid(),
      accountId: estado.cuenta.id,
      dailyLimit: String(m.dailyLimit),
      perTxLimit: String(m.perTxLimit),
      approvalThreshold: String(m.approvalThreshold),
      asset: String(m.asset),
      assetContractId: null,
      expiresAt: new Date(String(m.expiresAt)).toISOString(),
      status: 'ACTIVO',
      keyVersion: estado.versionLlave,
      agentPublicKeyHex: estado.claveAgenteHex,
      contextRuleId: Number(m.contextRuleId ?? 0),
      validUntilLedger: Number(m.validUntilLedger ?? 0),
      createTxHash: String(m.createTxHash),
      revokeTxHash: null,
      revokeReason: null,
      revokedAt: null,
      createdAt: ahora(),
      summary: '',
    }
    estado.mandatos.push(mandato)
    auditar('MANDATO_CREADO', 'USUARIO', 'Mandato creado', {
      mandateId: mandato.id,
      data: {
        umbral: mandato.approvalThreshold,
        porTransaccion: mandato.perTxLimit,
        diario: mandato.dailyLimit,
      },
    })
    return ok(aMandateResponse(mandato), 201)
  }

  if (verbo === 'GET' && ruta === '/mandates/active') {
    const m = mandatoActivo()
    return ok(m ? aMandateResponse(m) : null)
  }

  if (verbo === 'GET' && ruta === '/mandates/active/limits') return ok(aLimitsResponse())

  if (verbo === 'GET' && ruta === '/mandates') {
    const ordenados = [...estado.mandatos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return ok(pagina(ordenados.map(aMandateResponse), int(search, 'page', 0), int(search, 'size', 20)))
  }

  const revoke = ruta.match(/^\/mandates\/([^/]+)\/revoke$/)
  if (revoke && verbo === 'POST') {
    const m = estado.mandatos.find((x) => x.id === revoke[1])
    if (!m) noEncontrado('El mandato')
    if (m.status !== 'ACTIVO') {
      conflicto('ESTADO_INVALIDO', 'Esta acci\u00f3n no se puede hacer en el estado actual.')
    }
    m.status = 'REVOCADO'
    m.revokedAt = ahora()
    m.revokeReason = 'USUARIO'
    m.revokeTxHash = hashTx()

    // Revocar rota la llave: la vieja queda inutil.
    estado.versionLlave += 1
    estado.claveAgenteHex = claveHex()

    auditar('MANDATO_REVOCADO', 'USUARIO', 'Mandato revocado por el usuario', {
      mandateId: m.id,
    })
    auditar('LLAVE_ROTADA', 'FIRMANTE', `Llave del agente rotada a la versi\u00f3n ${estado.versionLlave}`, {
      mandateId: m.id,
      data: { keyVersion: estado.versionLlave },
    })

    // Las aprobaciones pendientes caen en cascada.
    for (const a of estado.aprobaciones) {
      if (a.status !== 'PENDIENTE') continue
      const ref = a.proposal
      const p = ref ? estado.propuestas.find((x) => x.id === ref.id) : undefined
      if (!p || p.status !== 'PENDIENTE_APROBACION') continue
      a.status = 'RECHAZADA'
      a.decidedAt = ahora()
      a.reason = 'El mandato fue revocado antes de aprobar este pago.'
      p.status = 'RECHAZADO'
      p.rejectionCode = 'MANDATO_REVOCADO'
      p.rejectionMessage = 'El mandato fue revocado antes de aprobar este pago.'
      p.updatedAt = ahora()
    }

    return ok(aMandateResponse(m))
  }

  /* --- Chat -------------------------------------------------------- */
  if (verbo === 'POST' && ruta === '/chat') {
    const mensaje = String(datos.message ?? '').trim()
    const conversationId = String(datos.conversationId ?? uuid())
    const errores: Record<string, string> = {}
    if (!mensaje) errores.message = 'El mensaje no puede estar vac\u00edo.'
    else if (mensaje.length > 500) errores.message = 'El mensaje no puede tener m\u00e1s de 500 caracteres.'
    validarCampos(errores)

    // Limite de 20 mensajes por minuto.
    const haceUnMinuto = Date.now() - 60_000
    estado.mensajesPorMinuto = estado.mensajesPorMinuto.filter((t) => t >= haceUnMinuto)
    if (estado.mensajesPorMinuto.length >= 20) {
      throw new MockHttpError(
        429,
        'LIMITE_FRECUENCIA',
        'Hiciste muchas solicitudes seguidas. Espera un momento.',
      )
    }
    estado.mensajesPorMinuto.push(Date.now())

    const usuarioMsg: ChatMessage = {
      id: uuid(),
      role: 'USUARIO',
      type: 'MESSAGE',
      text: mensaje,
      proposalId: null,
      createdAt: ahora(),
    }
    estado.mensajes.push(usuarioMsg)
    auditar('CHAT_RECIBIDO', 'USUARIO', 'Mensaje recibido en el chat', {
      data: { longitud: mensaje.length },
    })

    let respuesta: RespuestaIa
    try {
      respuesta = interpretar(mensaje)
    } catch (err) {
      if (err instanceof ErrorIa) {
        auditar('IA_ERROR', 'IA', 'El servicio de IA no respondi\u00f3')
        throw new MockHttpError(503, 'IA_NO_DISPONIBLE', err.message)
      }
      throw err
    }
    auditar('IA_RESPUESTA', 'IA', 'La IA interpret\u00f3 el mensaje', {
      data: { tool: respuesta.tool, confianza: respuesta.confidence },
    })

    let propuestaResumen: ProposalSummary | null = null

    if (respuesta.tool === 'propose_payment') {
      const resultado = validar(respuesta, mensaje, gastado24h(), propuestasUltimos10Min())

      const propuesta: Proposal = {
        id: uuid(),
        status: 'PROPUESTO',
        originalText: mensaje,
        contactId: resultado.contacto?.id ?? null,
        contactName: resultado.contacto?.name ?? resultado.argumentos.contactName,
        destinationAddress: resultado.contacto?.stellarAddress ?? null,
        amount: resultado.argumentos.amount,
        asset: resultado.argumentos.asset,
        memo: resultado.argumentos.memo,
        aiConfidence: respuesta.confidence,
        mandateId: mandatoActivo()?.id ?? null,
        approvalId: null,
        txHash: null,
        explorerUrl: null,
        rejectionCode: null,
        rejectionMessage: null,
        createdAt: ahora(),
        updatedAt: ahora(),
        sentAt: null,
        confirmedAt: null,
        checks: resultado.checks,
      }

      if (!resultado.valido) {
        propuesta.status = 'RECHAZADO'
        propuesta.rejectionCode = resultado.rechazo?.code ?? 'ESQUEMA_INVALIDO'
        propuesta.rejectionMessage = resultado.rechazo?.message ?? ''
        propuesta.updatedAt = ahora()
        estado.propuestas.unshift(propuesta)
        auditar('PROPUESTA_CREADA', 'IA', 'Propuesta de pago creada', {
          proposalId: propuesta.id,
          mandateId: propuesta.mandateId,
        })
        auditar('VALIDACION_RECHAZADA', 'BACKEND', `Validaci\u00f3n rechazada: ${propuesta.rejectionCode}`, {
          proposalId: propuesta.id,
          data: { checks: resultado.checks },
        })
      } else {
        propuesta.status = resultado.decision
        propuesta.updatedAt = ahora()
        estado.propuestas.unshift(propuesta)
        auditar('PROPUESTA_CREADA', 'IA', 'Propuesta de pago creada', {
          proposalId: propuesta.id,
          mandateId: propuesta.mandateId,
        })
        auditar('VALIDACION_OK', 'BACKEND', 'Las 8 reglas pasaron', {
          proposalId: propuesta.id,
          data: { checks: resultado.checks, confianza: respuesta.confidence },
        })

        if (resultado.decision === 'PENDIENTE_APROBACION') {
          const aprobacion: Approval = {
            id: uuid(),
            status: 'PENDIENTE',
            reason: `Supera tu umbral de ${resultado.contacto?.name ?? 'aprobación'} sin preguntar (${resultado.argumentos.amount} USDC).`,
            expiresAt: enHoras(24),
            createdAt: ahora(),
            decidedAt: null,
            proposal: {
              id: propuesta.id,
              status: propuesta.status,
              contactName: propuesta.contactName,
              amount: propuesta.amount,
              asset: propuesta.asset,
              memo: propuesta.memo,
              originalText: propuesta.originalText,
            },
          }
          estado.aprobaciones.unshift(aprobacion)
          propuesta.approvalId = aprobacion.id
          auditar('APROBACION_SOLICITADA', 'BACKEND', 'Se pidi\u00f3 aprobaci\u00f3n al usuario', {
            proposalId: propuesta.id,
            mandateId: propuesta.mandateId,
          })
        } else {
          // Bajo el umbral: el agente firma sin preguntar.
          auditar('APROBACION_APROBADA', 'BACKEND', 'Aprobado autom\u00e1ticamente por estar bajo el umbral', {
            proposalId: propuesta.id,
            mandateId: propuesta.mandateId,
          })
          firmarYEnviar(propuesta)
        }
      }

      propuestaResumen = aProposalSummary(propuesta)

      const agenteMsg: ChatMessage = {
        id: uuid(),
        role: 'AGENTE',
        type: 'PROPOSAL',
        text: respuesta.texto,
        proposalId: propuesta.id,
        createdAt: ahora(),
      }
      estado.mensajes.push(agenteMsg)
      const payload: ChatResponse = {
        conversationId,
        reply: { ...agenteMsg },
        proposal: propuestaResumen,
      }
      return ok(payload)
    }

    const agenteMsg: ChatMessage = {
      id: uuid(),
      role: 'AGENTE',
      type: 'MESSAGE',
      text: respuesta.texto,
      proposalId: null,
      createdAt: ahora(),
    }
    estado.mensajes.push(agenteMsg)
    const payload: ChatResponse = {
      conversationId,
      reply: { ...agenteMsg },
      proposal: null,
    }
    return ok(payload)
  }

  if (verbo === 'GET' && ruta === '/chat/messages') {
    return ok(estado.mensajes)
  }

  /* --- Propuestas --------------------------------------------------- */
  if (verbo === 'GET' && ruta === '/proposals') {
    resolverEnvios()
    const filtro = queryParams(search).get('status')
    let items = estado.propuestas
    if (filtro) items = items.filter((p) => p.status === filtro)
    return ok(pagina(items, int(search, 'page', 0), int(search, 'size', 20)))
  }

  const propuestaId = ruta.match(/^\/proposals\/([^/]+)$/)
  if (propuestaId && verbo === 'GET') {
    resolverEnvios()
    const p = estado.propuestas.find((x) => x.id === propuestaId[1])
    if (!p) noEncontrado('La propuesta')
    return ok(p)
  }

  /* --- Aprobaciones -------------------------------------------------- */
  if (verbo === 'GET' && ruta === '/approvals') {
    expirarAprobaciones()
    const filtro = queryParams(search).get('status')
    let items = estado.aprobaciones
    if (filtro) items = items.filter((a) => a.status === filtro)
    return ok(pagina(items, int(search, 'page', 0), int(search, 'size', 20)))
  }

  const aprobar = ruta.match(/^\/approvals\/([^/]+)\/approve$/)
  if (aprobar && verbo === 'POST') {
    const a = estado.aprobaciones.find((x) => x.id === aprobar[1])
    if (!a) noEncontrado('La aprobaci\u00f3n')
    if (a.status !== 'PENDIENTE') {
      conflicto('ESTADO_INVALIDO', 'Esta acci\u00f3n no se puede hacer en el estado actual.')
    }
    if (new Date(a.expiresAt).getTime() < Date.now()) {
      a.status = 'EXPIRADA'
      a.decidedAt = ahora()
      const caduca = estado.propuestas.find((p) => p.id === a.proposal?.id)
      if (caduca) {
        caduca.status = 'RECHAZADO'
        caduca.rejectionCode = 'APROBACION_EXPIRADA'
        caduca.rejectionMessage = 'La solicitud de aprobaci\u00f3n venci\u00f3 sin respuesta.'
        caduca.updatedAt = ahora()
      }
      auditar('APROBACION_EXPIRADA', 'BACKEND', 'La aprobaci\u00f3n venci\u00f3 sin respuesta', {
        proposalId: a.proposal?.id ?? null,
      })
      conflicto('ESTADO_INVALIDO', 'La solicitud de aprobaci\u00f3n ya venci\u00f3.')
    }

    const p = estado.propuestas.find((x) => x.id === a.proposal?.id)
    if (!p) noEncontrado('La propuesta')

    // Al aprobar se REVALIDAN las reglas 5-7 con los valores de ahora.
    const rechazos = validarTopesAlAprobar(Number(p.amount ?? 0), p.id)
    if (rechazos) {
      a.status = 'RECHAZADA'
      a.decidedAt = ahora()
      a.reason = rechazos.message
      p.status = 'RECHAZADO'
      p.rejectionCode = rechazos.code
      p.rejectionMessage = rechazos.message
      p.updatedAt = ahora()
      auditar('APROBACION_RECHAZADA', 'BACKEND', `Aprobaci\u00f3n rechazada al revalidar: ${rechazos.code}`, {
        proposalId: p.id,
      })
      return ok(decision(a, p))
    }

    a.status = 'APROBADA'
    a.decidedAt = ahora()
    p.status = 'APROBADO'
    p.updatedAt = ahora()
    auditar('APROBACION_APROBADA', 'USUARIO', 'El usuario aprob\u00f3 el pago', { proposalId: p.id })
    firmarYEnviar(p)
    return ok(decision(a, p))
  }

  const rechazarAprobacion = ruta.match(/^\/approvals\/([^/]+)\/reject$/)
  if (rechazarAprobacion && verbo === 'POST') {
    const a = estado.aprobaciones.find((x) => x.id === rechazarAprobacion[1])
    if (!a) noEncontrado('La aprobaci\u00f3n')
    if (a.status !== 'PENDIENTE') {
      conflicto('ESTADO_INVALIDO', 'Esta acci\u00f3n no se puede hacer en el estado actual.')
    }
    const p = estado.propuestas.find((x) => x.id === a.proposal?.id)
    a.status = 'RECHAZADA'
    a.decidedAt = ahora()
    a.reason = datos.reason ? String(datos.reason) : 'Rechazaste este pago.'
    if (p) {
      p.status = 'RECHAZADO'
      p.rejectionCode = 'RECHAZADO_POR_USUARIO'
      p.rejectionMessage = a.reason
      p.updatedAt = ahora()
    }
    auditar('APROBACION_RECHAZADA', 'USUARIO', 'El usuario rechaz\u00f3 el pago', {
      proposalId: a.proposal?.id ?? null,
    })
    return ok(decision(a, p))
  }

  /* --- Alertas ------------------------------------------------------ */
  if (verbo === 'GET' && ruta === '/alerts') {
    const filtro = queryParams(search).get('status')
    let items = estado.alertas
    if (filtro) items = items.filter((a) => a.status === filtro)
    return ok(pagina(items, int(search, 'page', 0), int(search, 'size', 20)))
  }

  const confirmarAlerta = ruta.match(/^\/alerts\/([^/]+)\/confirm$/)
  if (confirmarAlerta && verbo === 'POST') {
    const a = estado.alertas.find((x) => x.id === confirmarAlerta[1])
    if (!a) noEncontrado('La alerta')
    a.status = 'RECONOCIDA'
    a.decidedAt = ahora()
    auditar('ALERTA_CONFIRMADA', 'USUARIO', 'El usuario confirm\u00f3 el movimiento', {
      mandateId: a.mandateId,
      data: { txHash: a.txHash },
    })
    return ok(a)
  }

  const reportarAlerta = ruta.match(/^\/alerts\/([^/]+)\/report$/)
  if (reportarAlerta && verbo === 'POST') {
    const a = estado.alertas.find((x) => x.id === reportarAlerta[1])
    if (!a) noEncontrado('La alerta')
    if (a.status !== 'PENDIENTE') {
      conflicto('ESTADO_INVALIDO', 'Esta acci\u00f3n no se puede hacer en el estado actual.')
    }
    a.status = 'REPORTADA'
    a.decidedAt = ahora()

    const mandato = mandatoActivo()
    let revokeTxHash: string | null = null
    if (mandato) {
      mandato.status = 'REVOCADO'
      mandato.revokedAt = ahora()
      mandato.revokeReason = 'LLAVE_COMPROMETIDA'
      revokeTxHash = hashTx()
      mandato.revokeTxHash = revokeTxHash
    }
    estado.versionLlave += 1
    estado.claveAgenteHex = claveHex()

    auditar('LLAVE_COMPROMETIDA', 'USUARIO', 'El usuario report\u00f3 la llave como comprometida', {
      mandateId: mandato?.id ?? null,
    })
    auditar('MANDATO_REVOCADO', 'BACKEND', 'Mandato revocado por llave comprometida', {
      mandateId: mandato?.id ?? null,
    })
    auditar('LLAVE_ROTADA', 'FIRMANTE', `Llave rotada a la versi\u00f3n ${estado.versionLlave}`, {
      mandateId: mandato?.id ?? null,
      data: { keyVersion: estado.versionLlave },
    })

    for (const ap of estado.aprobaciones) {
      if (ap.status !== 'PENDIENTE') continue
      const p = estado.propuestas.find((x) => x.id === ap.proposal?.id)
      if (!p || p.status !== 'PENDIENTE_APROBACION') continue
      ap.status = 'RECHAZADA'
      ap.decidedAt = ahora()
      ap.reason = 'El mandato fue revocado antes de aprobar este pago.'
      p.status = 'RECHAZADO'
      p.rejectionCode = 'MANDATO_REVOCADO'
      p.rejectionMessage = ap.reason
      p.updatedAt = ahora()
    }

    return ok({
      id: a.id,
      status: a.status,
      decidedAt: a.decidedAt,
      mandate: mandato
        ? {
            id: mandato.id,
            status: mandato.status,
            revokeReason: mandato.revokeReason,
            contextRuleId: mandato.contextRuleId,
            revokeTxHash,
          }
        : null,
      newKeyVersion: estado.versionLlave,
      nextStep:
        'Revoca la regla on-chain de la smart account con la llave vieja y crea un mandato ' +
        'nuevo con la llave vigente antes de volver a pedir pagos.',
    })
  }

  /* --- Historial y auditoria ----------------------------------------- */
  if (verbo === 'GET' && ruta === '/history') {
    resolverEnvios()
    const items: HistoryItem[] = estado.propuestas
      .filter((p) => p.status === 'CONFIRMADO' || p.status === 'ENVIADO' || p.status === 'FALLIDO')
      .map((p) => ({
        proposalId: p.id,
        status: p.status,
        contactName: p.contactName,
        destinationAddress: p.destinationAddress,
        amount: p.amount,
        asset: p.asset,
        memo: p.memo,
        txHash: p.txHash,
        explorerUrl: p.explorerUrl,
        approvedBy:
          p.status === 'RECHAZADO'
            ? null
            : p.approvalId
              ? 'USUARIO'
              : p.status === 'CONFIRMADO' || p.status === 'ENVIADO'
                ? 'AUTOMATICO'
                : null,
        // `HistoryItemResponse` si trae `sentAt` y `confirmedAt`, y ahi si son
        // obligatorios.
        sentAt: p.sentAt ?? null,
        confirmedAt: p.confirmedAt ?? null,
      }))
    return ok(pagina(items, int(search, 'page', 0), int(search, 'size', 20)))
  }

  if (verbo === 'GET' && ruta === '/audit') {
    let items = estado.auditoria
    const porPropuesta = queryParams(search).get('proposalId')
    if (porPropuesta) items = items.filter((e) => e.proposalId === porPropuesta)
    const ordenados = [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    return ok(pagina(ordenados, int(search, 'page', 0), int(search, 'size', 50)))
  }

  /* --- Demo: llave robada --------------------------------------------- */
  if (verbo === 'POST' && ruta === '/demo/attack') {
    const dest = String(datos.destinationAddress ?? '').trim().toUpperCase()
    const montoTexto = String(datos.amount ?? '').trim()
    const errores: Record<string, string> = {}
    if (!/^G[A-Z2-7]{55}$/.test(dest)) {
      errores.destinationAddress =
        'La direcci\u00f3n de destino es obligatoria y debe ser una cuenta Stellar G de 56 caracteres.'
    }
    if (!montoTexto) errores.amount = 'El monto es obligatorio.'
    else if (!/^[0-9]+(\.[0-9]{1,7})?$/.test(montoTexto)) {
      errores.amount = 'El monto debe ser un n\u00famero con hasta 7 decimales.'
    }
    validarCampos(errores)

    const monto = Number(montoTexto)
    // El atacante salta al agente: no pasa por el chat ni por las 8 reglas.
    const propuesta: Proposal = {
      id: uuid(),
      status: 'PROPUESTO',
      originalText: `[ataque] ${montoTexto} USDC a ${dest}`,
      contactId: null,
      contactName: 'Destinatario desconocido',
      destinationAddress: dest,
      amount: montoTexto,
      asset: 'USDC',
      memo: 'salida sin pasar por el agente',
      aiConfidence: null,
      mandateId: mandatoActivo()?.id ?? null,
      approvalId: null,
      txHash: null,
      explorerUrl: null,
      rejectionCode: null,
      rejectionMessage: null,
      createdAt: ahora(),
      updatedAt: ahora(),
      sentAt: null,
      confirmedAt: null,
      checks: [],
    }
    estado.propuestas.unshift(propuesta)
    auditar('ATAQUE_DEMO', 'RED', 'Intento de pago sin pasar por el agente', {
      proposalId: propuesta.id,
      mandateId: propuesta.mandateId,
      data: { monto: montoTexto, destino: dest },
    })

    // Solo lo detiene el tope on-chain del contrato, no el mandato.
    if (estado.gastadoOnchain24h + monto > TOPE_ONCHAIN_24H) {
      propuesta.status = 'FALLIDO'
      propuesta.rejectionCode = 'TOPE_ONCHAIN'
      propuesta.rejectionMessage = `El contrato rechaz\u00f3 el pago: tope on-chain de ${TOPE_ONCHAIN_24H} USDC en 24 horas (c\u00f3digo 3221).`
      propuesta.updatedAt = ahora()
      auditar('TX_FALLIDA', 'RED', 'La cadena bloque\u00f3 el ataque por tope on-chain', {
        proposalId: propuesta.id,
        data: { contractCode: 3221 },
      })
      const fallo: AttackDemoResponse = {
        proposalId: propuesta.id,
        status: propuesta.status,
        txHash: null,
        error: {
          code: 'TOPE_ONCHAIN',
          contractCode: 3221,
          stage: 'CONTRATO',
          message: propuesta.rejectionMessage,
        },
      }
      return ok(fallo)
    }

    const tx = hashTx()
    propuesta.txHash = tx
    propuesta.explorerUrl = `https://stellar.expert/explorer/testnet/tx/${tx}`
    propuesta.status = 'CONFIRMADO'
    propuesta.sentAt = ahora()
    propuesta.confirmedAt = ahora()
    propuesta.updatedAt = ahora()
    estado.gastadoOnchain24h = redondear(estado.gastadoOnchain24h + monto)
    estado.ledger += 1
    // No se registra en `pagosDelChat`: por eso el detector lo marca.
    auditar('TX_CONFIRMADA', 'RED', 'El pago del atacante pas\u00f3 sin autorizaci\u00f3n', {
      proposalId: propuesta.id,
      data: { txHash: tx, monto: montoTexto },
    })
    // Y por eso aparece la alerta: aqui, en vez de esperar al job de 60 s.
    conciliar(tx, dest, monto)

    const ok_: AttackDemoResponse = {
      proposalId: propuesta.id,
      status: propuesta.status,
      txHash: tx,
      error: null,
    }
    return ok(ok_)
  }

  throw new MockHttpError(404, 'RECURSO_NO_ENCONTRADO', `No hay ruta para ${verbo} ${ruta}.`)
}

/* ------------------------------------------------------------------ */
/* Ayudas de estado                                                   */
/* ------------------------------------------------------------------ */

function ok(body: unknown, status = 200): ResultadoMock {
  return { body, status }
}

/**
 * Marca `EXPIRADA` las aprobaciones vencidas sin respuesta.
 * Es `ScheduledJobs` en el backend (`APPROVAL_EXPIRY_INTERVAL_MS`).
 */
function expirarAprobaciones(): void {
  for (const a of estado.aprobaciones) {
    if (a.status !== 'PENDIENTE') continue
    if (new Date(a.expiresAt).getTime() >= Date.now()) continue
    a.status = 'EXPIRADA'
    a.decidedAt = ahora()
    const p = estado.propuestas.find((x) => x.id === a.proposal?.id)
    if (p) {
      p.status = 'RECHAZADO'
      p.rejectionCode = 'APROBACION_EXPIRADA'
      p.rejectionMessage = 'La solicitud de aprobaci\u00f3n venci\u00f3 sin respuesta.'
      p.updatedAt = ahora()
    }
    auditar('APROBACION_EXPIRADA', 'BACKEND', 'La aprobaci\u00f3n venci\u00f3 sin respuesta', {
      proposalId: a.proposal?.id ?? null,
    })
  }
}

/** Revalida las reglas 5-7 al aprobar, con los valores de ese momento. */
function validarTopesAlAprobar(
  monto: number,
  _proposalId: string,
): { code: NonNullable<Proposal['rejectionCode']>; message: string } | null {
  const mandato = mandatoActivo()
  if (!mandato) {
    return { code: 'SIN_MANDATO_ACTIVO', message: 'No tienes un mandato activo.' }
  }
  const perTx = Number(mandato.perTxLimit)
  if (monto > perTx) {
    return {
      code: 'SUPERA_TOPE_TRANSACCION',
      message: `No hice el pago: supera tu tope por transacci\u00f3n (${perTx} USDC).`,
    }
  }
  const diario = Number(mandato.dailyLimit)
  const gastado = gastado24h()
  if (gastado + monto > diario) {
    return {
      code: 'SUPERA_TOPE_DIARIO',
      message: `No hice el pago: solo te quedan ${Math.max(diario - gastado, 0)} USDC en las \u00faltimas 24 horas.`,
    }
  }
  return null
}

function decision(a: Approval, p: Proposal | undefined): ApprovalDecision {
  return {
    id: a.id,
    status: a.status,
    decidedAt: a.decidedAt,
    proposal: p
      ? {
          id: p.id,
          status: p.status,
          txHash: p.txHash,
          explorerUrl: p.explorerUrl,
          rejectionCode: p.rejectionCode,
          rejectionMessage: p.rejectionMessage,
        }
      : null,
  }
}

// El estado del mock no se expone entero a la app: las pantallas leen los
// DTOs por `resources.ts`, igual que contra el backend real.
