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

## Autenticación del MVP

- Todas las rutas `/api/**` (menos `/api/health`) piden el header `X-User-Id` con el id que devuelve
  `POST /api/users`. No hay contraseñas: es un MVP de hackathon.
- `/api/agent-tools/**` es solo para el servicio de IA y además pide `X-Service-Key` = `AGENT_TOOLS_KEY`.
- Los errores siempre tienen el mismo formato: `{ timestamp, status, code, message, path, details, traceId }`.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `SERVER_PORT` | `8080` | Puerto HTTP |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/nexora`, `nexora`, `nexora_dev` | Base de datos |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origen del frontend |
| `AI_MODE` | `mock` | `mock` (reglas fijas) o `http` (servicio de IA real) |
| `AI_BASE_URL`, `AI_SERVICE_KEY` | `http://localhost:8000` | Servicio de IA y la clave que le manda el backend |
| `AI_CONNECT_TIMEOUT_MS`, `AI_READ_TIMEOUT_MS` | `2000`, `15000` | Tiempos de espera de la IA |
| `AI_MIN_CONFIDENCE` | `0.7` | Confianza mínima para aceptar un pago |
| `SIGNER_MODE` | `mock` | `mock` o `http` (firmante real) |
| `SIGNER_BASE_URL`, `SIGNER_SERVICE_KEY` | `http://localhost:3001` | Firmante y la clave que le manda el backend |
| `SIGNER_CONNECT_TIMEOUT_MS`, `SIGNER_READ_TIMEOUT_MS` | `2000`, `45000` | Tiempos de espera del firmante |
| `AGENT_TOOLS_KEY` | — | Clave que la IA manda en `X-Service-Key` |
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
| `DEMO_ATTACK_ENABLED` | `true` | Habilita `POST /api/demo/attack` (404 si está apagado) |

Nunca subas `.env`: está en `.gitignore`. Las claves reales se comparten por fuera del repo.

El backend **no arranca** si detecta valores de ejemplo (`cambia-esto`, `<…>`, vacío o `nexora_dev`) donde
pueden quedar expuestos:

- `AI_SERVICE_KEY` y `AGENT_TOOLS_KEY` con `AI_MODE=http`.
- `SIGNER_SERVICE_KEY` con `SIGNER_MODE=http`.
- `AGENT_TOOLS_KEY` y `DB_PASSWORD` cuando la base no está en `localhost`.

En desarrollo local con los mocks arranca sin `.env`. El error nombra la variable, nunca su valor.

## Endpoints

| Recurso | Rutas |
|---|---|
| Salud | `GET /api/health` |
| Usuarios | `POST /api/users`, `GET /api/users/me` |
| Cuenta | `POST /api/accounts`, `GET /api/accounts/me` |
| Llave del agente | `GET /api/agent/public-key` |
| Contactos | `GET/POST /api/contacts`, `GET/PUT/DELETE /api/contacts/{id}` (borrar = archivar) |
| Mandatos | `POST /api/mandates`, `GET /api/mandates`, `GET /api/mandates/active`, `GET /api/mandates/active/limits`, `POST /api/mandates/{id}/revoke` |
| Chat | `POST /api/chat`, `GET /api/chat/messages` |
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
