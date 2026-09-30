# Riendas

Panel de pagos con agente y mandato sobre Stellar.

Escribes "paga 25 a María por la pizza". Si el pago cabe dentro de los topes
del mandato, sale solo. Si se pasa del umbral, te lo pregunta. Si alguien usa
tu llave sin pasar por el agente, te avisa.

**El frontend no firma nada.** La seguridad vive en el contrato de Stellar y
en el backend. El panel registra, muestra y pide las dos cosas que requieren a
una persona: crear el mandato y aprobar un pago.

Cliente del backend `com.nexora.riendas` (Spring Boot). El contrato que exige
está en [`API-CONTRACT.md`](./API-CONTRACT.md).

---

## Arrancar

```bash
npm install
npm run dev
```

Y ya está. Sin backend, sin PostgreSQL: si no hay `VITE_API_URL`, la app usa
el **mock**, un backend falso en memoria con el mismo contrato y el mismo
comportamiento. Sirve para trabajar la interfaz entera.

### Contra el backend real

```bash
# PowerShell
$env:VITE_API_URL="http://localhost:8080"; npm run dev
```

```bash
# bash
VITE_API_URL=http://localhost:8080 npm run dev
```

| Variable | Por defecto | |
|---|---|---|
| `VITE_API_URL` | *(vacío)* | Base de la API. Vacío = rutas relativas + mock. |
| `VITE_MOCK` | `auto` | `true` fuerza el mock; `auto` lo activa si no hay `VITE_API_URL`. |
| `VITE_STELLAR_NETWORK` | `TESTNET` | El backend solo admite TESTNET. |

Requiere **Node ≥ 20.19** (usa `--experimental-strip-types`).

---

## Scripts

| | |
|---|---|
| `npm run dev` | Servidor de Vite. |
| `npm run build` | `tsc -b` + build de producción. |
| `npm run preview` | Sirve el build. |
| `npm run typecheck` | El contrato de TypeScript entero. |
| `npm run lint` | ESLint. |
| `npm run smoke` | **62 comprobaciones** del mock, sin navegador. |
| `npm run check:format` | Aritmética decimal: acarreos, nulos, cifras grandes. |
| `npm run check:contrato` | Compara los DTO de Java con `src/api/types.ts`. |

Los tres últimos no usan framework de tests: son scripts de Node que se leen y
se ejecutan en un segundo. El de contrato necesita el backend a disco; si no
está, lo dice y sale bien:

```bash
NEXORA_BACKEND="C:/ruta/al/backend" npm run check:contrato
```

---

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | El chat. El hilo es el producto. |
| `/aprobaciones` | Pagos que superaron el umbral y esperan tu "sí". |
| `/alertas` | Movimientos que el agente no hizo. Confirmar o reportar. |
| `/contactos` | Lista blanca de destinatarios. |
| `/mandato` | Topes, llave y revocación. |
| `/historial` | Pagos confirmados y enviados. |
| `/auditoria` | Todos los eventos, filtrables por propuesta. |
| `/demo` | El atacante con la llave robada. |

Sin login: `POST /api/users` **crea** la sesión y su id viaja en `X-User-Id`.
Si borras `localStorage`, empiezas de cero con otro usuario.

---

## Estructura

```
src/
  api/
    types.ts       El contrato. 1:1 con los DTO de Java.
    endpoints.ts   Las URLs, en un solo objeto.
    resources.ts   Una función tipada por endpoint.
    client.ts      Cabeceras, timeout, reintentos, mock vs. real.
    queries.ts     Hooks de TanStack Query.
    errors.ts      ApiError y NetworkError tipados.
    mock/          Backend falso: estado, reglas, IA y firmante.
  components/      UI genérica (ui.tsx), vocabulario del dominio (domain.tsx)
                   y componentes de la propuesta.
  config/env.ts    Variables de entorno y modo mock.
  hooks/           Queries, tema, confirmación, toasts.
  lib/             cn, formateo de importes y utilidades de Stellar.
  pages/           Las nueve pantallas.
  sesion/          SesionContext: onboarding, cuenta y mandato.
scripts/           smoke, check-format, check-contrato.
```

`AppShell` no se monta hasta que los tres pasos del arranque han respondido, así
que no existe un estado intermedio visible.

---

## Decisiones que conviene conocer antes de tocar código

**Los importes son string.** `"15.0000000"`, nunca `15`. USDC en Stellar tiene
7 decimales y las sumas se muestran al usuario; con `number` el error sería
visible. La aritmética está en `src/lib/format.ts` con `BigInt`, y
`check:format` la prueba.

**El chat es la pantalla principal.** Las otras ocho páginas son vistas del
mismo estado, no secciones independientes.

**El contrato se comprueba solo.** `npm run check:contrato` compara los records
de Java con los tipos de TypeScript. Hoy coinciden **19/19**. Hay cuatro
diferencias aceptadas a propósito, documentadas en el propio script y en
`API-CONTRACT.md`.

**El mock no es un stub.** Comparte contrato, reglas de validación, topes
on-chain, conciliación y alertas con el backend real. Por eso el smoke test
sirve: encuentra bugs de verdad, no solo que el mock responda.

**El panel nunca pide, almacena ni firma con claves privadas.** La smart
account se despliega fuera y aquí solo se registra.

**`/api/agent-tools/**` no se consume.** Exige `X-Service-Key` y lo usa el agente
de IA desde fuera. Está en `endpoints.ts` como constancia y **no** tiene
wrappers en `resources.ts`, a propósito.

---

## Documentación

- [`API-CONTRACT.md`](./API-CONTRACT.md) — qué exige este frontend al backend.
- [`ARCHITECTURA.md`](./ARCHITECTURA.md) — capas, decisiones y sus porqués.
- [`DESIGN.md`](./DESIGN.md) — tokens, estados, tema y accesibilidad.

---

## Estado

Funciona de punta a punta en mock, con 62 comprobaciones de humo, aritmética
verificada y contrato sincronizado con el backend.

Pendiente: la paleta y el logo definitivos (los tokens de `index.css` están
completos, la marca es provisional) y la validación visual, que no se ha podido
ejecutar por falta de navegador.
