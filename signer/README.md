# Firmante (Nexora)

Servicio Node 22 + TypeScript en el puerto **3001**. Guarda solo `AGENT_MASTER_SECRET` y deriva una llave Ed25519 por smart account y versión. No decide si un pago es válido: firma lo que pide el backend.

Hoy: `GET /agent-key`, `POST /sign-and-submit` y `GET /transactions/{proposalId}`. Solo testnet. Nunca subir el `.env`.

## Cómo correrlo

```bash
cp .env.example .env
# Editar SIGNER_SERVICE_KEY y AGENT_MASTER_SECRET (32+ bytes en base64 o hex)
npm install
npm test
npm run dev
```

Queda en `http://127.0.0.1:3001`. Solo lo llama el backend (`X-Service-Key`).

### `GET /agent-key`

```bash
curl -sS "http://127.0.0.1:3001/agent-key?smartAccountAddress=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&keyVersion=1" \
  -H "X-Service-Key: $SIGNER_SERVICE_KEY"
```

### `POST /sign-and-submit`

Lo llama el backend (no el frontend). Misma `X-Service-Key`. Idempotente por `proposalId`: dos veces el mismo id no paga dos veces. Si la pública del mandato no es la derivada → `400 LLAVE_NO_COINCIDE`. Si la red frena el tope → `200` con `status: FALLIDO` y `error.code: SpendingLimitExceeded`.

```bash
curl -sS http://127.0.0.1:3001/sign-and-submit \
  -H "X-Service-Key: $SIGNER_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "proposalId": "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    "smartAccountAddress": "C...",
    "contextRuleId": 1,
    "keyVersion": 1,
    "agentPublicKeyHex": "64-chars-hex",
    "destinationAddress": "G...",
    "amount": "1.0000000",
    "amountUnits": "10000000",
    "assetContractId": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "memo": "prueba"
  }'
```

`GET /transactions/{proposalId}` devuelve el mismo JSON. `404` si nunca llegó. El resultado queda en `signer/data/proposals.json` (no se sube): si reiniciás el proceso, el mismo `proposalId` no se paga otra vez.

Cuando llegue el backend: `SIGNER_MODE=http`, `SIGNER_BASE_URL=http://127.0.0.1:3001` y la misma `SIGNER_SERVICE_KEY`. El firmante tiene que estar corriendo (`npm run dev`) con `FEE_PAYER_SECRET` fondeado. El frontend no llama a este puerto.

El rechazo `SpendingLimitExceeded` (60 USDC contra un tope de 50) solo aparece si la caja tiene saldo para ese monto. Si no, la simulación responde que no hay saldo y no llega a la política.

## Vectores de prueba (D1)

Secreto maestro **de prueba** (32 bytes ASCII `riendas-test-master-secret-v1!!!`), no usar en el `.env` real:

```
AGENT_MASTER_SECRET_TEST=cmllbmRhcy10ZXN0LW1hc3Rlci1zZWNyZXQtdjEhISE=
```

Derivación: HKDF-SHA256, salt `riendas-agent-key-v1`, info `smartAccountAddress:keyVersion`, L=32, luego `Keypair.fromRawEd25519Seed`. La salt conserva el nombre anterior del proyecto a propósito: cambiarla cambia todas las llaves de agente ya registradas en los mandatos.

| smartAccountAddress | keyVersion | publicKeyHex | address |
|---|---|---|---|
| `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | 1 | `a145adc206bdf8237d2c825814d0d50208ab2397a151c1b768d37d14386d0150` | `GCQULLOCA267QI35FSBFQFGQ2UBARKZDS6QVDQNXNDJX2FBYNUAVAVPU` |
| `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | 2 | `a802c4bf0043303f4f4ba644e433bfed862cc332ff401a1def5ba6a16fce78e4` | `GCUAFRF7ABBTAP2PJOTEJZBTX7WYMLGDGL7UAGQ555N2NILPZZ4OJAXE` |

La misma entrada siempre produce la misma llave. Cambiar la versión o la cuenta cambia la pública. `npm test` fija estos valores.
