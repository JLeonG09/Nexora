# Contrato API — Nexora

Lo que este panel **consume** del backend `com.nexora` (Spring Boot).

No es una especificación de lo que el backend debería hacer: describe lo que
**exige** para que la interfaz funcione. La fuente de verdad son los
`@RequestMapping` de `controllers/` y los records de `dtos/responses` y
`dtos/requests`.

Ese contrato se comprueba solo:

```bash
npm run check:contrato
```

El script parsea los records de Java y los compara con `src/api/types.ts`.
Hoy coincide en **19/19** registros. Si alguien añade un campo en Java y
olvida el tipo de TypeScript, el script falla.

---

## Reglas que no se negocian

Estas cinco cosas ya rompieron el panel una vez. Están aquí para que no
vuelvan a pasar.

| Regla | Detalle |
|---|---|
| **Sin versión en la ruta** | Los controladores cuelgan de `/api/**`, no de `/api/v1/**`. Añadir `/v1` da 404 en todas las peticiones. |
| **La cabecera es `X-User-Id`** | No hay `Authorization`, ni login, ni JWT. `POST /api/users` devuelve el id y ese id viaja en claro en cada llamada. |
| **`/api/agent-tools/**` no se toca** | Esos endpoints exigen `X-Service-Key` y los usa el agente de IA desde fuera. El panel los tiene listados en `endpoints.ts` solo como constancia, y **no** tiene wrappers en `resources.ts`. |
| **Los importes son string** | `"15.0000000"`, nunca `15`. Ni el backend ni el panel hacen aritmética en coma flotante. |
| **La paginación es `items`/`totalItems`** | No `content`/`totalElements`. Es `Page<T>` en `types.ts`. |

---

## Autenticación

`CurrentUserInterceptor` lee `X-User-Id`. El cliente (`src/api/client.ts`) lo
adjunta solo y avisa a la app cuando el backend responde `401`, para que la
sesión se cierre sola.

Única ruta pública: `GET /api/health`.

El id se guarda en `localStorage` bajo `nexora.userId`. Es un prototipo de
demo; en producción esto lo sustituiría una sesión firmada en servidor.

---

## Salud

### `GET /api/health`

Único endpoint sin `X-User-Id`. Alimenta el LED de conexión de la barra lateral:
`status`, `signerMode` y `aiMode` bastan para saber si el backend puede firmar
de verdad o está en modo simulado.

```json
{
  "status": "UP",
  "aiMode": "mock",
  "signerMode": "mock",
  "network": "TESTNET"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `string` | |
| `aiMode` | `"mock" \| "http"` | |
| `signerMode` | `"mock" \| "http"` | Si es `mock`, ninguna firma es real. |
| `network` | `string` | El backend solo admite `TESTNET` por ahora. |

---

## Usuario

### `POST /api/users`

Crea el usuario y devuelve su id. **No hay contraseña**: ese id es la
credencial durante toda la demo. Se llama una vez, en el onboarding.

```json
{ "displayName": "Ana", "email": "ana@ejemplo.com" }
```

→ `User`: `id`, `displayName`, `email`, `createdAt`.

### `GET /api/users/me`

Primera llamada al montar la app. `404` si el id de `localStorage` ya no existe
en el backend: el panel entra al onboarding otra vez.

---

## Smart account

La smart account es un contrato en Stellar que el usuario despliega **fuera**.
El panel solo la registra contra el backend; nunca genera ni firma con claves.

### `POST /api/accounts`

```json
{ "smartAccountAddress": "G...", "network": "TESTNET" }
```

Rechaza direcciones que no sean `C...` (smart accounts, no `G...`) y rechaza
`PUBLIC` (mainnet). `409 CUENTA_YA_REGISTRADA` si el usuario ya tiene una.

→ `Account`: `id`, `userId`, `smartAccountAddress`, `credentialId`,
`network`, `explorerUrl`, `createdAt`.

### `GET /api/accounts/me`

### `GET /api/agent/public-key`

Llave pública del agente para la versión vigente. Devuelve `AgentKey`:
`smartAccountAddress`, `keyVersion`, `publicKeyHex`, `address`,
`ed25519VerifierAddress`.

---

## Contactos

Lista blanca de destinatarios. El backend **nunca** toma la dirección del
mensaje de la IA: siempre sale de aquí. Por eso esta página es crítica, no
adorno.

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/contacts?page=&size=` | → `Page<Contact>` |
| `GET` | `/api/contacts/{id}` | → `Contact` |
| `POST` | `/api/contacts` | → `Contact` |
| `PUT` | `/api/contacts/{id}` | → `Contact` |
| `DELETE` | `/api/contacts/{id}` | Archiva. El backend guarda la fila para el historial. |

`Contact`: `id`, `name`, `stellarAddress`, `note`, `createdAt`, `updatedAt`.

Entrada: `{ name, stellarAddress, note? }`.

`409 CONTACTO_DUPLICADO` si la dirección ya está en la lista.

---

## Mandato

El permiso que autoriza al agente a firmar sin preguntar en cada pago. Sus
tres topes —umbral, por transacción y diario— son la promesa que se le hace al
usuario, así que la interfaz los muestra tal cual los devuelve el backend, sin
recalcularlos.

| Método | Ruta | |
|---|---|---|
| `POST` | `/api/mandates` | Crea el mandato. |
| `GET` | `/api/mandates/active` | → `Mandate \| null` |
| `GET` | `/api/mandates/active/limits` | → `Limits` |
| `GET` | `/api/mandates?page=&size=` | → `Page<Mandate>` |
| `POST` | `/api/mandates/{id}/revoke` | Cuerpo opcional: `{ revokeTxHash }`. |

`Mandate` (19 campos) incluye los tres topes como string
(`dailyLimit`, `perTxLimit`, `approvalThreshold`), `keyVersion`,
`contextRuleId`, `validUntilLedger`, los hashes de creación y revocación,
`revokeReason` (`USUARIO` | `LLAVE_COMPROMETIDA`), y un `summary` que el
backend ya redactó para explicarlo en humano.

El mandato se crea a partir de una transacción **ya ejecutada** en la cadena:
el panel envía `createTxHash`, `keyVersion`, `agentPublicKeyHex`,
`contextRuleId` y `validUntilLedger`, pero nunca firma.

`Limits` (9 campos) es lo que pinta la barra de gasto del día:
`mandateId`, `asset`, `dailyLimit`, `spentLast24h`, `availableLast24h`,
`perTxLimit`, `approvalThreshold`, `expiresAt`, `status`.

Cuando no hay mandato, `GET /api/mandates/active` devuelve `null` y
`/limits` devuelve los campos a `null`.

`409 MANDATO_ACTIVO_EXISTENTE` al crear uno nuevo con otro vigente.

---

## Chat

### `POST /api/chat`

```json
{ "message": "paga 25 a María por la pizza", "conversationId": null }
```

`conversationId` es opcional: si falta, el backend usa la última conversación.

→ `ChatResponse`: `{ conversationId, reply, proposal }`, donde `proposal` es
un `ProposalSummaryDto` (12 campos, sin los internos) o `null`.

### `GET /api/chat/messages?conversationId=`

→ `ChatMessage[]`. `role` es `USUARIO` | `AGENTE`; `type` es `MESSAGE` |
`PROPOSAL` (los mensajes de tipo `PROPOSAL` llevan `proposalId`).

---

## Propuestas de pago

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/proposals?status=&page=&size=` | → `Page<Proposal>` |
| `GET` | `/api/proposals/{id}` | → `Proposal` |

`ProposalResponse` tiene **18 campos** y coincide exactamente con el tipo
`Proposal` de `src/api/types.ts`.

### Los 16 `RejectionCode`

El panel traduce cada uno a una frase con su acción. No es un `string` libre:
está cerrado en el tipo.

| Código | |
|---|---|
| `ESQUEMA_INVALIDO` | El texto no se pudo entender como un pago. |
| `ACTIVO_NO_PERMITIDO` | Solo USDC. |
| `CONFIANZA_BAJA` | La IA no estuvo segura. El umbral es `>= 0.7`. |
| `CAMPO_NO_FUNDAMENTADO` | La IA inventó un campo. |
| `CONTACTO_NO_ENCONTRADO` | El destinatario no está en la lista blanca. |
| `CONTACTO_AMBIGUO` | El nombre encaja con más de un contacto. |
| `MONTO_NO_EN_TEXTO` | **La IA no puede inventar el importe.** |
| `MONTO_AMBIGUO` | |
| `SIN_MANDATO_ACTIVO` | |
| `MANDATO_EXPIRADO` | |
| `SUPERA_TOPE_TRANSACCION` | |
| `SUPERA_TOPE_DIARIO` | Ventana de 24 h, no día natural. |
| `LIMITE_FRECUENCIA` | |
| `RECHAZADO_POR_USUARIO` | |
| `APROBACION_EXPIRADA` | |
| `MANDATO_REVOCADO` | |

`status`: `PROPUESTO`, `RECHAZADO`, `PENDIENTE_APROBACION`, `APROBADO`,
`ENVIADO`, `CONFIRMADO`, `FALLIDO`.

### Diferencias aceptadas a propósito

Estos cuatro campos están en TypeScript y **no** en Java:

- `credentialId` — el panel no lo muestra.
- `sentAt` y `confirmedAt` — llegan por `HistoryItemResponse`, no por
  `ProposalResponse`. El tipo los declara opcionales porque el mock los usa
  para que el chat y el historial se vean iguales; la interfaz ya funciona
  sin ellos.
- `checks` — no lo manda nadie. Las reglas que pasaron están en la auditoría
  del evento `VALIDACION_OK`, no en la propuesta. El panel las recalcula en
  local a partir de la propuesta y de los topes vigentes (`evaluarReglas` en
  `components/domain.tsx`) y por eso no las pide.

---

## Aprobaciones

Pagos que superaron el umbral del mandato. **Aprobar revalida los topes en el
momento**: si ya no pasan, el backend rechaza igual.

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/approvals?status=&page=&size=` | → `Page<Approval>` |
| `POST` | `/api/approvals/{id}/approve` | → `ApprovalDecision` |
| `POST` | `/api/approvals/{id}/reject` | Cuerpo opcional: `{ reason }`. |

Ojo con el `id`: es el **de la aprobación**, no el de la propuesta. El panel
lleva su propia `approvalId` desde que se creó.

`Approval` (14 campos) trae `proposal` anidado (7 campos, incluido
`originalText`) para que la bandeja pueda pintar el texto que el usuario
escribió. `ApprovalDecision` (10 campos) devuelve el `proposal` con su
`txHash` ya resuelto.

`status`: `PENDIENTE`, `APROBADA`, `RECHAZADA`, `EXPIRADA`.

---

## Alertas

Un movimiento de USDC que salió de la smart account sin que el agente lo
pidiera. Es la única defensa real del producto, así que la respuesta son dos
botones y ninguno es opcional.

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/alerts?status=&page=&size=` | → `Page<Alert>` |
| `POST` | `/api/alerts/{id}/confirm` | "Sí fui yo": se cierra, el mandato sigue vivo. |
| `POST` | `/api/alerts/{id}/report` | "No fui yo": revoca mandato y rota llave. |

`ReportAlertResponse` (11 campos) devuelve el mandato revocationado, el
`newKeyVersion` y un `nextStep` con lo que el usuario tiene que hacer ahora en
la cadena. El panel muestra ese texto tal cual.

`status`: `PENDIENTE`, `RECONOCIDA`, `REPORTADA`.

---

## Historial y auditoría

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/history?page=&size=` | → `Page<HistoryItem>` |
| `GET` | `/api/audit?proposalId=&page=&size=` | → `Page<AuditEvent>` |

`HistoryItemResponse` (12 campos) sí trae `sentAt` y `confirmedAt`, además de
`approvedBy` (`AUTOMATICO` | `USUARIO`), que es lo que permite decir "este
pago salió solo".

`AuditEventResponse` (8 campos): `id`, `occurredAt`, `eventType`, `actor`,
`proposalId`, `mandateId`, `summary`, `data`.

`actor`: `USUARIO`, `IA`, `BACKEND`, `FIRMANTE`, `RED`.

---

## Demo: el atacante con la llave robada

### `POST /api/demo/attack`

```json
{ "destinationAddress": "G...", "amount": "10.0000000" }
```

Simula un atacante que ya tiene una llave y salta al agente. No pide
confirmación, así que el único freno posible es el contrato: si el ataque se
detiene, es porque el mandato lo detuvo, no porque la UI preguntara.

→ `AttackDemoResponse`: `proposalId`, `status`, `txHash` y `error`
(`code`, `contractCode`, `stage`, `message`) o `null`.

El panel exige smart account **y** mandato activo antes de dejar lanzarlo, y
avisa del caso `DEMO_ATTACK_ENABLED=false`, que devuelve `404` cuando la demo
está apagada en el backend.

---

## Errores

Formato único del manejador global. El `code` es estable y sirve para decidir;
el `message` ya viene en español para mostrarlo.

```json
{
  "timestamp": "2026-09-30T10:00:00",
  "status": 409,
  "code": "MANDATO_ACTIVO_EXISTENTE",
  "message": "Ya tienes un mandato activo.",
  "path": "/api/mandates",
  "details": [{ "field": "dailyLimit", "message": "..." }],
  "traceId": null
}
```

### `ApiErrorCode`

Son fallos de la **petición**, no decisiones sobre un pago. Esa distinción
importa: los `RejectionCode` son el backend respondiendo "no", y estos son "no pude
contestarte".

| Código | |
|---|---|
| `VALIDACION_FALLIDA` | `details` viene poblado. |
| `USUARIO_NO_IDENTIFICADO` | Falta `X-User-Id`. |
| `CLAVE_SERVICIO_INVALIDA` | Solo `agent-tools`. |
| `RECURSO_NO_ENCONTRADO` | |
| `CUENTA_YA_REGISTRADA` | |
| `MANDATO_ACTIVO_EXISTENTE` | |
| `SIN_MANDATO_ACTIVO` | |
| `SIN_CUENTA` | |
| `ESTADO_INVALIDO` | Transición no permitida. |
| `CONTACTO_DUPLICADO` | |
| `LLAVE_DESACTUALIZADA` | Hay que rotar antes de operar. |
| `LIMITE_FRECUENCIA` | |
| `IA_NO_DISPONIBLE` | |
| `FIRMANTE_NO_DISPONIBLE` | |
| `ERROR_INTERNO` | |

---

## Reintentos

`client.ts` reintenta solo red y `5xx`, con espera creciente (300 ms, 900 ms).
Nunca reintenta `400, 401, 403, 404, 409, 422, 428`: un `4xx` daría el mismo
error y, en el caso de las escrituras, podría duplicar el efecto.

El timeout por defecto son 15 s y se combina con el `AbortSignal` de React
Query, para que un cambio de filtro no espere a una petición que ya no importa.
