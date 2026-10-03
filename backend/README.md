# Nexora · Backend

API REST de Nexora: recibe los pedidos de pago en lenguaje natural, los pasa a la IA, **valida todo lo que la IA
devuelve** contra los contactos y el mandato del usuario, pide la firma al servicio firmante y deja cada paso en la
auditoría. También vigila la red: si sale de la smart account un pago que no hizo el agente, avisa al usuario.

> Solo testnet. Sin auditoría de seguridad. No usar con fondos reales.

## Requisitos

- Java 21 (el wrapper `mvnw` descarga Maven).
- PostgreSQL 16 en `localhost:5432`.

## Cómo correrlo

1. Crea el usuario y las bases (la de tests se limpia antes de cada test):

   ```sql
   CREATE USER nexora WITH PASSWORD 'nexora_dev';
   CREATE DATABASE nexora OWNER nexora;
   CREATE DATABASE nexora_test OWNER nexora;
   ```

2. Copia `.env.example` a `.env` y ajusta lo que necesites. Sin `.env` arranca con los valores por defecto:
   IA, firmante y red simulados.

3. Arranca:

   ```bash
   ./mvnw spring-boot:run        # Windows: .\mvnw.cmd spring-boot:run
   ```

   Flyway crea el esquema al arrancar. Queda en `http://localhost:8080`:
   - Swagger: `http://localhost:8080/swagger-ui.html`
   - Salud: `GET /api/health`

4. Tests (usan `nexora_test` y el perfil `test`, con todo simulado y las tareas programadas apagadas):

   ```bash
   ./mvnw test
   ```

## Autenticación

- Las rutas de usuario piden `Authorization: Bearer` con el access token de Privy (ES256).
  El backend valida `iss = privy.io` y `aud = PRIVY_APP_ID` contra el JWKS de la app.
  `POST /api/users` crea o vincula al usuario con el `sub` de ese token.
- `/api/health`, la documentación OpenAPI y `/api/agent-tools/**` no piden ese token.
- `/api/agent-tools/**` es solo para el servicio de IA y pide `X-Service-Key` = `AGENT_TOOLS_KEY`
  más `X-User-Id` con el id interno del usuario. La API de usuario no lee esa cabecera.
- Los errores siempre tienen el mismo formato: `{ timestamp, status, code, message, path, details, traceId }`.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `SERVER_PORT` | `8080` | Puerto HTTP |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/nexora`, `nexora`, `nexora_dev` | Base de datos |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origen del frontend |
| `AI_MODE` | `mock` | `mock` (reglas fijas), `http` (servicio de IA propio), `hybrid` (reglas + modelo pequeño) o `local` (el modelo decide todo) |
| `AI_BASE_URL`, `AI_SERVICE_KEY` | `http://localhost:8000` | Servicio de IA y la clave que le manda el backend |
| `AI_MODEL` | `qwen2.5:0.5b` | Con `AI_MODE=hybrid` o `local`: modelo que sirve Ollama o Cactus |
| `AI_CONNECT_TIMEOUT_MS`, `AI_READ_TIMEOUT_MS` | `2000`, `15000` | Tiempos de espera de la IA |
| `AI_MIN_CONFIDENCE` | `0.7` | Confianza mínima para aceptar un pago |
| `SIGNER_MODE` | `mock` | `mock` o `http` (firmante real) |
| `SIGNER_BASE_URL`, `SIGNER_SERVICE_KEY` | `http://localhost:3001` | Firmante y la clave que le manda el backend |
| `SIGNER_CONNECT_TIMEOUT_MS`, `SIGNER_READ_TIMEOUT_MS` | `2000`, `45000` | Tiempos de espera del firmante |
| `AGENT_TOOLS_KEY` | — | Clave que la IA manda en `X-Service-Key`. Obligatoria, mínimo 32 caracteres |
| `STELLAR_NETWORK` | `TESTNET` | Red |
| `USDC_CONTRACT_ID` | contrato USDC de testnet | Contrato cuyos eventos `transfer` se vigilan |
| `STELLAR_EXPLORER_BASE_URL` | `https://stellar.expert/explorer/testnet` | Enlaces `explorerUrl` |
| `STELLAR_EVENTS_MODE` | `mock` | `mock` (ledger simulado) o `rpc` (eventos reales vía Soroban RPC) |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | RPC para `STELLAR_EVENTS_MODE=rpc` |
| `JOBS_ENABLED` | `true` | Tareas programadas (seguimiento de envíos y expiración de aprobaciones) |
| `SENT_POLL_INTERVAL_MS` | `10000` | Cada cuánto se consulta al firmante por los pagos `ENVIADO` |
| `APPROVAL_EXPIRY_INTERVAL_MS` | `60000` | Cada cuánto se expiran aprobaciones vencidas |
| `RECONCILIATION_ENABLED`, `RECONCILIATION_INTERVAL_MS` | `true`, `60000` | Detector de pagos no reconocidos |
| `APPROVAL_TTL_HOURS` | `24` | Vida de una solicitud de aprobación |
| `RATE_LIMIT_CHAT_PER_MINUTE` | `20` | Mensajes de chat por minuto y usuario (429 si se pasa) |
| `RATE_LIMIT_PROPOSALS_PER_10_MIN` | `5` | Propuestas de pago por 10 minutos (regla 8) |
| `DEMO_ATTACK_ENABLED` | `false` | Habilita `POST /api/demo/attack` solo con firmante `mock` (404 si está apagado o el firmante no es mock). No arranca con `SIGNER_MODE=http`, tampoco en mayúsculas |
| `PRIVY_APP_ID` | — | App ID de Privy. Obligatorio si el firmante o la IA no están en modo mock |

Nunca subas `.env`: está en `.gitignore`. Las claves reales se comparten por fuera del repo.

El backend **no arranca** si `AGENT_TOOLS_KEY` tiene menos de 32 caracteres o es un valor de ejemplo
(`cambia-esto`, `changeme`, `change-me`, `change_me` o uno de esos alargado, `<…>`, vacío).
La misma regla aplica a `AI_SERVICE_KEY` con `AI_MODE=http` y a `SIGNER_SERVICE_KEY` con `SIGNER_MODE=http`.
Además rechaza la contraseña de desarrollo (`nexora_dev` y similares) cuando la base no es local:

- `AGENT_TOOLS_KEY` siempre.
- `AI_SERVICE_KEY` con `AI_MODE=http` (mayúsculas o minúsculas).
- `SIGNER_SERVICE_KEY` con `SIGNER_MODE=http` (mayúsculas o minúsculas).
- `DEMO_ATTACK_ENABLED=true` con `SIGNER_MODE=http` (mayúsculas o minúsculas). El endpoint responde 404 si el firmante no es `mock`.
- `PRIVY_APP_ID` vacío cuando el firmante o la IA no están en modo mock.
- `DB_PASSWORD` cuando la base no está en `localhost`.

En desarrollo local con los mocks hace falta un `AGENT_TOOLS_KEY` de al menos 32 caracteres. El error nombra la variable, nunca su valor.

## Endpoints

| Recurso | Rutas |
|---|---|
| Salud | `GET /api/health` |
| Usuarios | `POST /api/users`, `GET /api/users/me` |
| Cuenta | `POST /api/accounts`, `GET /api/accounts/me` |
| Llave del agente | `GET /api/agent/public-key` |
| Contactos | `GET/POST /api/contacts`, `GET/PUT/DELETE /api/contacts/{id}` (borrar = archivar) |
| Mandatos | `POST /api/mandates`, `GET /api/mandates`, `GET /api/mandates/active`, `GET /api/mandates/active/limits`, `POST /api/mandates/{id}/revoke` |
| Chat | `POST /api/chat`, `GET /api/chat/messages`, `GET /api/chat/conversations` |
| Propuestas | `GET /api/proposals`, `GET /api/proposals/{id}` |
| Aprobaciones | `GET /api/approvals`, `POST /api/approvals/{id}/approve`, `POST /api/approvals/{id}/reject` |
| Historial y auditoría | `GET /api/history`, `GET /api/audit?proposalId=` |
| Alertas | `GET /api/alerts?status=`, `POST /api/alerts/{id}/confirm`, `POST /api/alerts/{id}/report` |
| Demo | `POST /api/demo/attack` |
| Herramientas de la IA | `GET /api/agent-tools/contacts`, `/limits`, `/history?limit=` |

El detalle de cada campo está en Swagger.

## Cómo se decide un pago

La IA solo **propone**. El backend aplica, en orden, las 8 reglas de validación y guarda en la auditoría cuáles
pasaron:

1. Esquema: solo los campos permitidos, como texto, activo `USDC`.
2. Confianza mínima y ningún campo "no fundamentado".
3. Destinatario en los contactos del usuario (la dirección sale siempre de la base, nunca de la IA).
4. El monto aparece escrito tal cual en el mensaje del usuario.
5. Mandato activo y vigente.
6. Tope por transacción.
7. Tope diario (ventana móvil de 24 h, con la cuenta bloqueada para evitar carreras).
8. Frecuencia de propuestas.

Si pasa y el monto supera el umbral de aprobación, queda `PENDIENTE_APROBACION` y el usuario lo aprueba o rechaza
(al aprobar se revalidan las reglas 5–7). Si no, se firma directo. Estados:
`PROPUESTO → RECHAZADO | PENDIENTE_APROBACION | APROBADO → ENVIADO → CONFIRMADO | FALLIDO`.

Encima de todo esto, el contrato on-chain aplica su propio tope de gasto (`SpendingLimitExceeded`).

## Agente híbrido (por defecto en Docker)

Con `AI_MODE=hybrid` las reglas leen el mensaje y un modelo pequeño (`qwen2.5:0.5b`, ~400 MB) solo clasifica la
intención cuando no hay verbo reconocible:

- Las reglas sacan contacto (exacto, por apellido, con una letra de error), monto (`AmountExtractor`, el mismo de la
  regla 4) y memo (`por …`). Las respuestas salen de plantillas, no del modelo.
- El modelo solo entra si el mensaje trae contacto o monto pero ningún verbo («15 a Ana por el café», «Ana me debe
  20») y devuelve `pagar | saldo | saludo | otro` en JSON con esquema cerrado.
- Si el modelo no está, tarda o responde otra cosa, el agente sigue con las reglas y pide aclarar.
- Si el agente preguntó el monto, un «15» suelto completa el pago con el contacto del mensaje anterior.

`src/test/resources/agente/frases.txt` tiene las frases de prueba con la decisión esperada; `HybridAiClientTest` las
corre todas. Para medir el modelo real con el contenedor levantado:

```bash
AGENT_EVAL_URL=http://localhost:11434 ./mvnw test -Dtest=HybridAiClientTest
```

## IA local (Ollama o Cactus)

Con `AI_MODE=local` (y un modelo grande, p. ej. `AI_MODEL=qwen2.5:3b`) el backend habla con cualquier servidor compatible con la API de OpenAI
(`POST {AI_BASE_URL}/v1/chat/completions`) y un modelo con tool calling:

- **Docker (por defecto):** el servicio `agent` de `docker-compose.yml` corre Ollama con `AI_MODEL`.
- **ARM (Mac M, Raspberry Pi, móvil):** [`cactus serve`](https://github.com/cactus-compute/cactus) con
  `--host 0.0.0.0 --no-cloud-handoff`. Cactus no compila en x86 (sus kernels son solo NEON).

```bash
AI_MODE=local AI_BASE_URL=http://localhost:11434 AI_MODEL=qwen2.5:3b ./mvnw spring-boot:run
```

- El backend escribe las instrucciones y ofrece la herramienta `propose_payment` con los ids de los contactos como
  lista cerrada. El activo lo fija el backend (`USDC`); el modelo solo elige contacto, monto y memo.
- La API de OpenAI no trae confianza: es 0,9 si el contacto elegido aparece nombrado en el mensaje; si no, el
  campo `contactId` va como no fundamentado y la regla 2 rechaza el pago.
- Todo lo demás sigue igual: las 8 reglas se aplican a la IA local como a cualquier otra.

## Marcadores `#` de los mocks

Escríbelos dentro del mensaje del chat para forzar cada rama sin servicios reales. Solo funcionan en modo `mock`.

| Marcador | Mock | Qué pasa |
|---|---|---|
| `#ia-error` | IA | La IA falla: 503 `IA_NO_DISPONIBLE` |
| `#ia-inventa` | IA | La IA devuelve el monto dividido entre 100: rechazo `MONTO_NO_EN_TEXTO` |
| `#ia-baja` | IA | Confianza 0.4: rechazo `CONFIANZA_BAJA` |
| `#ia-extra` | IA | La IA agrega `destinationAddress`: rechazo `ESQUEMA_INVALIDO` |
| `#firmante-caido` | Firmante | El firmante no responde: la propuesta queda `ENVIADO` y la tarea programada la resuelve |
| `#firmante-lento` | Firmante | Devuelve `ENVIADO`; la siguiente consulta la confirma |

Los `#ia-*` se quitan del memo; los `#firmante-*` se quedan para que los lea el firmante simulado. El firmante simulado
además aplica un tope on-chain de **50 USDC en 24 h** por smart account (`SpendingLimitExceeded`, código 3221) y
responde `LLAVE_NO_COINCIDE` si la llave del mandato no es la actual.

Ejemplos: `Págale 15 USDC a Ana por el logo` (se confirma), `Págale 18 USDC a Ana por la web` (pide aprobación),
`Págale 25 USDC a Ana` (supera el tope por transacción).

## Rotación de llaves

Cada smart account tiene **una llave de agente por versión**, que genera el firmante.

1. El frontend pide `GET /api/agent/public-key` → `{ keyVersion, publicKeyHex }` e instala esa llave en la regla
   on-chain.
2. Crea el mandato con `POST /api/mandates` mandando ese mismo `keyVersion` y `agentPublicKeyHex`. Si ya no son los
   actuales responde 409 `LLAVE_DESACTUALIZADA`.
3. Cada pago manda al firmante la versión y la llave **del mandato**; si no coinciden con la del firmante, el pago
   falla con `LLAVE_NO_COINCIDE`.
4. **Revocar sube la versión** (auditoría `MANDATO_REVOCADO` y `LLAVE_ROTADA`): la llave vieja queda inútil aunque
   alguien la tenga, y el siguiente mandato usa una llave nueva. Revocar también rechaza en cascada las propuestas
   pendientes de aprobación (`MANDATO_REVOCADO`).
5. Que un mandato **expire no rota la llave**: se puede crear otro con la misma versión.

## Alertas: pagos que no hizo el agente

Cada `RECONCILIATION_INTERVAL_MS` el backend lee los pagos USDC que salieron de cada smart account desde el último
ledger revisado (la cuenta arranca en el ledger del momento en que se registra):

- Si el pago corresponde a una propuesta del chat, se ignora.
- Si no, crea una alerta `PENDIENTE` (una sola por transacción) y audita `MOVIMIENTO_NO_RECONOCIDO`.

El usuario ve la alerta en `GET /api/alerts` ("Detectamos un pago de X USDC a G…. ¿Fuiste tú?") y decide:

- `POST /api/alerts/{id}/confirm` → `RECONOCIDA` ("fui yo").
- `POST /api/alerts/{id}/report` → `REPORTADA` ("no fui yo"): audita `LLAVE_COMPROMETIDA`, revoca el mandato activo
  con motivo `LLAVE_COMPROMETIDA`, rota la llave y devuelve `nextStep`, el aviso para revocar la regla on-chain y
  crear un mandato nuevo.

Con `STELLAR_EVENTS_MODE=mock` los pagos salen de un ledger simulado donde el firmante simulado anota los pagos del
chat y del ataque. Con `rpc` se leen los eventos `transfer` reales del contrato USDC.

### Demo "llave robada"

1. Usuario con cuenta, contacto y mandato de 50 / 20 / 15.
2. `POST /api/demo/attack` con `{"destinationAddress":"G…","amount":"10"}`: simula que alguien usa la llave del
   agente. Pasa porque está bajo el tope on-chain (con `60` la red lo bloquea).
3. En menos de un minuto aparece la alerta en `GET /api/alerts?status=PENDIENTE`.
4. `POST /api/alerts/{id}/report`: mandato `REVOCADO`, `newKeyVersion` sube, los pagos pendientes quedan rechazados.
5. `GET /api/audit` cuenta toda la historia.

## Estructura

```
src/main/java/com/nexora/
  clients/       IA, firmante y eventos de la red (implementaciones mock, http y rpc)
  config/        propiedades, interceptores de headers, CORS, OpenAPI, tareas programadas
  controllers/   endpoints REST
  dtos/          contratos de entrada y salida
  entities/      entidades JPA y enums
  exceptions/    ApiException, códigos de error y manejador global
  repositories/  Spring Data JPA
  services/      reglas de negocio, validación, auditoría, conciliación y tareas programadas
src/main/resources/db/migration/   migraciones Flyway
```
