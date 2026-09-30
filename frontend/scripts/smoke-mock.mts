/**
 * Prueba de humo del backend simulado.
 *
 * Ejecuta el recorrido completo que hace la interfaz: alta, contactos,
 * mandato, un pago que sale solo, uno que pide confirmacion, uno rechazado y
 * el ataque con la llave robada. Comprueba en cada paso el codigo de estado y
 * el motivo, porque un mock que devuelve 200 con el cuerpo equivocado deja
 * pasar la pantalla verde y rompe el chat en silencio.
 *
 * Se ejecuta con el cargador de modulos de Vite, sin navegador.
 */

import { createServer } from 'vite'

const servidor = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const mock = await servidor.ssrLoadModule('/src/api/mock/index.ts')
const estado = await servidor.ssrLoadModule('/src/api/mock/estado.ts')
const modEndpoints = await servidor.ssrLoadModule('/src/api/endpoints.ts')
const endpoints = modEndpoints.endpoints

const { mockRequest } = mock
const { API_PREFIX } = await servidor.ssrLoadModule('/src/config/env.ts')

let fallos = 0
let pruebas = 0

function comprobar(etiqueta: string, condicion: boolean, detalle = '') {
  pruebas++
  if (condicion) {
    console.log(`  ok   ${etiqueta}`)
  } else {
    fallos++
    console.log(`  FALLA ${etiqueta}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

/**
 * El router lanza `MockHttpError` en vez de devolver un 4xx, igual que hace
 * el cliente HTTP real con la respuesta del backend. Aqui se traduce a un
 * `{ status }` para poder comprobar igual que en la interfaz.
 */
async function llamar(metodo: string, path: string, body?: unknown) {
  try {
    return await mockRequest(metodo, path, body)
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string; details?: unknown }
    return {
      status: e.status ?? 500,
      body: { code: e.code ?? 'ERROR_INTERNO', message: e.message ?? '', details: e.details ?? null },
    }
  }
}

function total(body: unknown, campo = 'totalItems'): number {
  const b = body as Record<string, unknown>
  return typeof b[campo] === 'number' ? (b[campo] as number) : -1
}

function items(body: unknown): Record<string, unknown>[] {
  const b = body as Record<string, unknown>
  return Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : []
}

/* ================================================================== */

console.log('\n== Salud ==')
{
  const r = await llamar('GET', endpoints.health())
  comprobar('responde 200', r.status === 200, `status ${r.status}`)
  const b = r.body as Record<string, unknown>
  comprobar('informa IA simulada', b.aiMode === 'mock')
  comprobar('informa firmante simulado', b.signerMode === 'mock')
  comprobar('informa TESTNET', b.network === 'TESTNET')
}

console.log('\n== Sin sesion no hay nada ==')
{
  const r = await llamar('GET', endpoints.contacts())
  comprobar('contactos pide cabecera de usuario', r.status === 401, `status ${r.status}`)
}

console.log('\n== Alta ==')
const usuario = (await llamar('POST', endpoints.createUser(), {
  displayName: 'Ana',
  email: 'ana@ejemplo.com',
})).body as Record<string, unknown>

comprobar('crea el usuario', typeof usuario.id === 'string' && usuario.id.length > 0)
comprobar('devuelve el nombre', usuario.displayName === 'Ana')

{
  const r = await llamar('POST', endpoints.createUser(), { displayName: '', email: 'x' })
  comprobar('rechaza usuario sin nombre', r.status === 400, `status ${r.status}`)
}

{
  const r = await llamar('GET', endpoints.me())
  comprobar('/users/me responde 200', r.status === 200)
}

const direccion = `C${Array.from({ length: 55 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('')}`

console.log('\n== Smart account ==')
{
  const r = await llamar('POST', endpoints.createAccount(), { smartAccountAddress: 'GNOESUNA', network: 'TESTNET' })
  comprobar('rechaza una direccion que no es C', r.status === 400, `status ${r.status}`)
}
{
  const r = await llamar('POST', endpoints.createAccount(), { smartAccountAddress: direccion, network: 'MAINNET' })
  comprobar('rechaza MAINNET', r.status === 400, `status ${r.status}`)
}
{
  const r = await llamar('POST', endpoints.createAccount(), { smartAccountAddress: direccion, network: 'TESTNET' })
  comprobar('registra la cuenta', r.status === 201, `status ${r.status}`)
  const c = r.body as Record<string, unknown>
  comprobar('devuelve explorerUrl', typeof c.explorerUrl === 'string')
}
{
  const r = await llamar('POST', endpoints.createAccount(), { smartAccountAddress: direccion, network: 'TESTNET' })
  comprobar('no permite dos cuentas', r.status === 409, `status ${r.status}`)
}


console.log('\n== Contactos ==')
{
  const r = await llamar('POST', endpoints.contacts(), { name: 'Maria', stellarAddress: 'G' + 'A'.repeat(55) })
  comprobar('crea el contacto', r.status === 201, `status ${r.status}`)
}
{
  const r = await llamar('POST', endpoints.contacts(), { name: 'Carlos', stellarAddress: 'G' + 'B'.repeat(55) })
  comprobar('crea un segundo contacto', r.status === 201, `status ${r.status}`)
}
{
  const r = await llamar('GET', endpoints.contacts({ size: 100 }))
  comprobar('lista dos contactos', total(r.body) === 2, `total ${total(r.body)}`)
}
{
  const r = await llamar('POST', endpoints.contacts(), { name: 'Ana', stellarAddress: 'G' + 'C'.repeat(55) })
  comprobar('acepta un tercero', r.status === 201)
}

console.log('\n== Sin mandato no se puede pagar ==')
{
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 10 USDC a Maria',
    conversationId: null,
  })
  const b = r.body as { proposal?: { rejectionCode?: string } | null }
  comprobar('el pago se rechaza sin mandato', b.proposal?.rejectionCode === 'SIN_MANDATO_ACTIVO', JSON.stringify(b.proposal))
}

console.log('\n== Mandato ==')
const llave = (await llamar('GET', endpoints.agentPublicKey())).body as Record<string, unknown>

/**
 * Topes del mandato en el recorrido: 10 / 25 / 45.
 *
 * Se quedan por debajo del tope diario on-chain del firmante simulado (50
 * USDC, `app.signer.mock.onchain-daily-limit`), como los que precarga la
 * pantalla de mandato. Con topes mas altos, el contrato frenaria pagos que el
 * mandato da por buenos y el guion de la demo no tendria sentido.
 */
const TOPE_UMBRAL = 10
const TOPE_PAGO = 25
const TOPE_DIARIO = 45

{
  const r = await llamar('POST', endpoints.createMandate(), {
    dailyLimit: String(TOPE_DIARIO),
    perTxLimit: String(TOPE_PAGO),
    approvalThreshold: String(TOPE_UMBRAL),
    asset: 'USDC',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    contextRuleId: 1,
    validUntilLedger: 1000000,
    createTxHash: 'a'.repeat(64),
    keyVersion: llave.keyVersion,
    agentPublicKeyHex: llave.publicKeyHex,
  })
  comprobar('crea el mandato', r.status === 201, `status ${r.status}`)
  const m = r.body as Record<string, unknown>
  comprobar('el mandato queda ACTIVO', m.status === 'ACTIVO')
}
{
  const r = await llamar('GET', endpoints.activeMandate())
  comprobar('el mandato activo se lee', r.status === 200)
}
{
  const r = await llamar('GET', endpoints.activeLimits())
  const l = r.body as Record<string, unknown>
  comprobar('los limites traen tope diario con 7 decimales', l.dailyLimit === '45.0000000', JSON.stringify(l))
  comprobar('los limites traen disponible', typeof l.availableLast24h === 'string')
}

console.log('\n== Pago dentro del mandato: sale solo ==')
{
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 8 USDC a Maria por la cena',
    conversationId: null,
  })
  const b = r.body as { proposal?: { status?: string; amount?: string } | null }
  comprobar('la propuesta se crea', b.proposal !== null, JSON.stringify(b))
  comprobar('paga sin preguntar', b.proposal?.status === 'CONFIRMADO', `status ${b.proposal?.status}`)
  comprobar('el importe es el del texto', b.proposal?.amount === '8.0000000', b.proposal?.amount)
}

console.log('\n== Pago por encima del umbral: pide confirmacion ==')
let pendienteId = ''
{
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 20 USDC a Carlos por el alquiler',
    conversationId: null,
  })
  const b = r.body as { proposal?: { status?: string; approvalId?: string | null } | null }
  comprobar('queda esperando aprobacion', b.proposal?.status === 'PENDIENTE_APROBACION', `status ${b.proposal?.status}`)
  // `POST /approvals/{id}/approve` lleva el id de la APROBACION, no el de la
  // propuesta: con el id equivocado el backend responde 404.
  pendienteId = b.proposal?.approvalId ?? ''

  const lista = await llamar('GET', endpoints.approvals({ status: 'PENDIENTE', page: 0, size: 10 }))
  comprobar('aparece en la bandeja', total(lista.body) >= 1, `total ${total(lista.body)}`)
}
{
  const r = await llamar('POST', endpoints.approve(pendienteId))
  const b = r.body as { status?: string; proposal?: { status?: string; txHash?: string } | null }
  comprobar('la aprobacion se concede', b.status === 'APROBADA', `status ${b.status}`)
  comprobar('el pago se firma', typeof b.proposal?.txHash === 'string', JSON.stringify(b.proposal))
}

console.log('\n== Destinatario desconocido: se rechaza ==')
{
  // "Pedro" no está en la lista blanca, pero la IA sí lee su nombre del texto.
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 20 USDC a Pedro por la pizza',
    conversationId: null,
  })
  const b = r.body as { proposal?: { status?: string; contactName?: string | null; rejectionCode?: string; rejectionMessage?: string } | null }
  comprobar('se rechaza', b.proposal?.status === 'RECHAZADO', `status ${b.proposal?.status}`)
  comprobar('el motivo es el contacto', b.proposal?.rejectionCode === 'CONTACTO_NO_ENCONTRADO', b.proposal?.rejectionCode)
  comprobar('el mensaje nombra a Pedro', (b.proposal?.rejectionMessage ?? '').includes('Pedro'), b.proposal?.rejectionMessage ?? '')
}
{
  // Sin nombre legible la regla 1 se adelanta: no hay esquema que validar.
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 20 USDC a mi primo',
    conversationId: null,
  })
  const b = r.body as { proposal?: { rejectionCode?: string } | null }
  comprobar('sin nombre no hay propuesta valida', b.proposal?.rejectionCode === 'ESQUEMA_INVALIDO', b.proposal?.rejectionCode)
}

console.log('\n== Monto inventado por la IA: se rechaza ==')
{
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 50 USDC a Maria por el regalo #ia-inventa',
    conversationId: null,
  })
  const b = r.body as { proposal?: { rejectionCode?: string } | null }
  comprobar('no inventa el importe', b.proposal?.rejectionCode === 'MONTO_NO_EN_TEXTO', b.proposal?.rejectionCode)
}

console.log('\n== Tope por transaccion ==')
{
  const r = await llamar('POST', endpoints.sendChat(), {
    message: 'paga 30 USDC a Carlos para la deuda',
    conversationId: null,
  })
  const b = r.body as { proposal?: { rejectionCode?: string } | null }
  comprobar('supera el tope por pago', b.proposal?.rejectionCode === 'SUPERA_TOPE_TRANSACCION', b.proposal?.rejectionCode)
}

console.log('\n== Tope diario: 24 h, no dia natural ==')
{
  const antes = estado.gastadoOnchain24h
  const r = await llamar('POST', endpoints.sendChat(), {
    // 20 <= 25 del tope por pago, pero ya se gastaron 28 de 45 en el día.
    message: 'paga 20 USDC a Ana por la cena de ayer',
    conversationId: null,
  })
  const b = r.body as { proposal?: { rejectionCode?: string; rejectionMessage?: string } | null }
  comprobar('supera el tope diario', b.proposal?.rejectionCode === 'SUPERA_TOPE_DIARIO', b.proposal?.rejectionCode)
  comprobar('el mensaje dice cuanto queda', (b.proposal?.rejectionMessage ?? '').includes('17'), b.proposal?.rejectionMessage ?? '')
  comprobar('el rechazo no gasta', estado.gastadoOnchain24h === antes, `${antes} -> ${estado.gastadoOnchain24h}`)
}

console.log('\n== Historial y auditoria ==')
{
  const r = await llamar('GET', endpoints.history({ page: 0, size: 20 }))
  comprobar('el historial responde 200', r.status === 200)
  comprobar('hay al menos un pago confirmado', total(r.body) >= 1, `total ${total(r.body)}`)
}
{
  const r = await llamar('GET', endpoints.audit({ page: 0, size: 50 }))
  comprobar('la auditoria responde 200', r.status === 200)
  const tipos = items(r.body).map((e) => e.eventType)
  comprobar('se registra USUARIO_CREADO', tipos.includes('USUARIO_CREADO'))
  comprobar('se registra MANDATO_CREADO', tipos.includes('MANDATO_CREADO'))
  comprobar('se registra TX_CONFIRMADA', tipos.includes('TX_CONFIRMADA'))
}

console.log('\n== Ataque con la llave robada ==')
{
  // Importe por encima del tope on-chain del contrato: la cadena lo para.
  const r = await llamar('POST', endpoints.runAttack(), {
    destinationAddress: 'G' + 'D'.repeat(55),
    amount: '5000',
  })
  const b = r.body as { status?: string; txHash?: string | null; error?: { code?: string | null; contractCode?: number | null } | null }
  comprobar('el tope on-chain lo detiene', b.status === 'FALLIDO', `status ${b.status}`)
  comprobar('sin hash: la tx no se emitio', b.txHash === null, `${b.txHash}`)
  comprobar('devuelve el codigo del contrato', b.error?.contractCode === 3221, JSON.stringify(b.error))
}

console.log('\n== Ataque que si sale: dispara la conciliacion ==')
{
  const r = await llamar('POST', endpoints.runAttack(), {
    destinationAddress: 'G' + 'D'.repeat(55),
    amount: '20',
  })
  const b = r.body as { status?: string; txHash?: string | null; error?: unknown }
  comprobar('el ataque pasa', b.status === 'CONFIRMADO', `status ${b.status}`)
  comprobar('trae hash de transaccion', typeof b.txHash === 'string')
  comprobar('no hay error de contrato', b.error === null)

  const lista = await llamar('GET', endpoints.alerts({ status: 'PENDIENTE', page: 0, size: 10 }))
  const alerta = items(lista.body)[0]
  comprobar('la conciliacion abre una alerta', alerta?.txHash === b.txHash, JSON.stringify(alerta?.txHash))
  comprobar('la alerta trae mensaje', typeof alerta?.message === 'string' && (alerta.message as string).length > 0)

  const id = alerta.id as string
  const rep = await llamar('POST', endpoints.reportAlert(id))
  const rb = rep.body as { mandate?: { status?: string } | null; newKeyVersion?: number; nextStep?: string }
  comprobar('reportar revoca el mandato', rb.mandate?.status === 'REVOCADO', JSON.stringify(rb.mandate))
  comprobar('reportar rota la llave', typeof rb.newKeyVersion === 'number' && rb.newKeyVersion > 0, `v${rb.newKeyVersion}`)
  comprobar('reportar explica el siguiente paso', typeof rb.nextStep === 'string' && rb.nextStep.length > 0)

  const m = await llamar('GET', endpoints.activeMandate())
  comprobar('el mandato ya no esta activo', m.body === null, JSON.stringify(m.body))
}

console.log('\n== Un movimiento ajeno genera su propia alerta ==')
{
  const antes = total((await llamar('GET', endpoints.alerts({ page: 0, size: 50 }))).body)
  // Firma posicional, como el job real del backend.
  estado.conciliar('f'.repeat(64), 'G' + 'E'.repeat(55), 77)
  const todas = await llamar('GET', endpoints.alerts({ page: 0, size: 50 }))
  const pendientes = await llamar('GET', endpoints.alerts({ status: 'PENDIENTE', page: 0, size: 50 }))
  comprobar('aparece una alerta nueva', total(todas.body) === antes + 1, `${antes} -> ${total(todas.body)}`)
  comprobar('la nueva esta pendiente', total(pendientes.body) === 1, `${total(pendientes.body)}`)
  comprobar('el importe va con 7 decimales', items(pendientes.body)[0].amount === '77.0000000', `${items(pendientes.body)[0].amount}`)
}

console.log('\n== Reportar dos veces la misma alerta ==')
{
  const r = await llamar('POST', endpoints.reportAlert('00000000-0000-0000-0000-000000000000'))
  comprobar('da 404 en una alerta inexistente', r.status === 404, `status ${r.status}`)
}

await servidor.close()

console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones correctas`)
if (fallos > 0) {
  console.log(`\n${fallos} FALLOS`)
  process.exit(1)
}
