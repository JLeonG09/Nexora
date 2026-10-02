# Arquitectura

Decisiones estructurales de **Nexora** y el porqué de cada una.

La idea que ordena todo el resto: *el frontend no firma nada*. Toda la
seguridad vive en el contrato de Stellar y en el backend. El panel es la forma
de **ver** lo que ya pasó y de **pedir** las dos cosas que sí requieren a una
persona: crear el mandato y aprobar un pago que se pasa del umbral.

---

## Capas

```
pages/          Pintan. No llaman a http ni conocen URLs.
components/     Presentación y vocabulario del dominio.
hooks/          TanStack Query: una función por endpoint.
api/resources   Una función tipada por endpoint. Aquí nace el HTTP.
api/client      Cabeceras, timeout, reintentos, mock vs. backend real.
api/endpoints   Las URLs, en un solo objeto.
api/types       El contrato, 1:1 con los DTO de Java.
api/mock        Backend falso en memoria, con el mismo contrato.
```

La regla que hace que esto se sostenga: **nadie salta un nivel**. Un componente
no hace `fetch`. Una página no escribe `/api/...`. Si el backend cambia la
forma de una respuesta, se arregla en `resources.ts` y no se buscan veinte
componentes.

### Por qué `api/resources` y no un hook por endpoint

Los hooks de `hooks/` son el contrato con React: estado de carga, error,
revalidación e invalidación de caché. `api/resources` es el contrato con el
backend. Separarlos permite que un script de Node (como `smoke`) use los
tipos y los endpoints sin React.

---

## Sesión sin login

No hay contraseñas ni JWT. `POST /api/users` devuelve el id y ese id viaja en
`X-User-Id`.

Es una decisión de prototipo, no una recomendación: el id es la credencial y
va en claro. Está aislada en tres sitios —`USER_HEADER`, `getUserId()` y
`setUserId()`— para que sustituirla por una sesión firmada sea un cambio
localizado.

`client.ts` es el único que adjunta la cabecera, y además es el que detecta el
`401` y llama al `onUnauthorizedHandler`. Ninguna página sabe que existe una
cabecera de autenticación.

---

## Sesión de onboarding

`POST /api/users` **crea** la sesión. No hay forma de volver a entrar si se
limpia `localStorage`: se crea otro usuario. Es aceptable porque el backend es
también un prototipo, y evita montar la pantalla de login que nadie usa.

`SesionContext` encadena el arranque en tres pasos, en este orden porque cada
uno depende del anterior:

1. `GET /api/users/me` — ¿existe el usuario del `localStorage`?
2. `GET /api/accounts/me` — ¿tiene smart account?
3. `GET /api/mandates/active` — ¿tiene mandato?

Según dónde falle, la app enruta al paso que falta: onboarding, alta de cuenta
o alta de mandato. `AppShell` no se monta hasta que los tres han respondido.

---

## Mock

Un backend falso en memoria, con el mismo contrato que el de verdad. Se activa
cuando `VITE_API_URL` está vacío, así que `git clone` + `pnpm dev` levanta la
app completa sin Spring Boot ni PostgreSQL.

`client.ts` decide: si `MOCK_ENABLED`, `request()` va a `requestMock()` y no
toca `fetch`. Las páginas no saben cuál de los dos está activo.

Lo que replica del backend, porque el panel depende de ello:

- **Estado compartido.** `estado.ts` es un objeto mutable con usuarios,
  contactos, mandatos, propuestas, aprobaciones, alertas y auditoría. Una
  propuesta creada en el chat se ve en el historial sin recargar.
- **Las 8 reglas en orden**, con corte en la primera que falla y los mismos 16
  `RejectionCode` (`mock/reglas.ts`).
- **La IA simulada** entiende pagos en lenguaje natural: verbos (`paga`,
  `pagar`, `transfiere`…), un solo importe, un contacto de la lista y un memo.
  Si el contacto no existe, propone el nombre y devuelve
  `CONTACTO_NO_ENCONTRADO`; nunca inventa una dirección.
- **El tope on-chain de 50 USDC.** El firmante mock lo aplica igual que el
  contrato, así que el ataque con la llave robada se detiene en el mismo sitio.
- **Conciliación y alertas** para movimientos que no salieron del agente.
- Latencia simulada y errores tipados (`MockHttpError`) para que el
  `401`/`404`/`409` se comporten como en el de verdad.

El smoke test (`pnpm smoke`) es el contrato ejecutable: **62 comprobaciones**
contra el mock, sin navegador. Es lo que atrapa bugs como un endpoint que
devuelve `status` sin desestructurar, o un aprobador que recibe el id de la
propuesta en vez del de la aprobación.

---

## El importe es un string

`"15.0000000"`, nunca `15`. Es el tipo `string` en `Proposal`, `Mandate`,
`Limits`, `Alert` y `HistoryItem`, y no hay `number` en ningún importe de la
API.

El motivo es que USDC en Stellar son 7 decimales y los saldos sumados a lo
largo del día llegan a cifras donde `Number` ya ha perdido unidades. Como
las sumas se muestran al usuario (gasto del día, barra del mandato, total del
historial), el error sería visible.

`src/lib/format.ts` hace la aritmética con `BigInt` sobre enteros escalados a
7 decimales: `sumarImportes`, `restarImportes`, `compararImportes`,
`porcentaje`, `aEscalado`. `scripts/check-format.mts` las prueba con acarreos,
nulos y cifras grandes.

---

## Las reglas se calculan en el panel

El backend **no** devuelve qué reglas pasaron. Guardan ese detalle en la
auditoría del evento `VALIDACION_OK`.

El panel no inventa el resultado: recalcula las ocho reglas en local a partir
de la propuesta y de los topes vigentes (`evaluarReglas` en
`components/domain.tsx`) y marca cada una como comprobable, correcta o
detectablemente fallida. Por eso la tarjeta de propuesta necesita `limits`:
sin los topes, la comprobación de límites no se puede explicar.

Es un compromiso consciente. La alternativa —pedir al backend una lista de
`checks`— rompería el contrato, y la fuente de verdad del rechazo
(`rejectionCode`) ya viene del servidor. Lo que se muestra aquí es la
explicación, no la decisión.

---

## Rutas

| Ruta | Página | |
|---|---|---|
| `/` | `ChatPage` | El hilo. Es el producto. |
| `/aprobaciones` | `AprobacionesPage` | Pagos que esperan confirmación. |
| `/alertas` | `AlertasPage` | Movimientos que el agente no hizo. |
| `/contactos` | `ContactosPage` | Lista blanca de destinatarios. |
| `/mandato` | `MandatoPage` | Topes, llave y revocación. |
| `/historial` | `HistorialPage` | Pagos confirmados y su detalle. |
| `/auditoria` | `AuditoriaPage` | Todos los eventos, filtrables por propuesta. |
| `/demo` | `DemoPage` | El atacante con la llave robada. |
| `*` | → `/` | Sin 404: nueve rutas, ocho accesos. |

Filtros y páginas viven en la URL (`useSearchParams`), para que el enlace sea
compartible y el botón de atrás funcione.

---

## Decisiones de la interfaz

**El chat es la pantalla principal, no un extra.** Si el producto se entiende
escribiendo "paga 25 a María", el chat es la interfaz y las otras ocho páginas
son vistas del mismo estado. `TarjetaPropuesta` es el componente que sostiene
ese contrato y por eso tiene una versión `compacta` para las listas densas.

**Nada se borra, se archiva.** `DELETE /api/contacts` archiva y el backend
conserva la fila, porque un historial que pierde referencias no explica nada
después.

**Todo número se muestra con su unidad y su moneda**, y los hashes Stellar van
en monoespaciado. Los importes salen de `formatAmount`, que no usa coma
flotante.

**Los estados son texto, no color.** `Badge` exige etiqueta siempre: un LED
verde sin palabra es invisible para quien no distingue el verde.

Ver [`DESIGN.md`](./DESIGN.md) para el sistema visual y
[`API-CONTRACT.md`](./API-CONTRACT.md) para el contrato con el backend.

---

## Verificación

| Comando | Qué cubre |
|---|---|
| `pnpm typecheck` | El contrato de TypeScript entero. |
| `pnpm lint` | ESLint. Hoy: 0 errores, 13 avisos de `react-refresh`. |
| `pnpm build` | `tsc -b` + build de Vite. |
| `pnpm smoke` | 62 comprobaciones del mock, sin navegador. |
| `pnpm check:format` | Aritmética decimal: acarreos, nulos, cifras grandes. |
| `pnpm check:contrato` | Compara los records de Java con `api/types.ts`. |

Los tres últimos son scripts de Node con `--experimental-strip-types`, sin
framework de test: son lo bastante directos para leerse y ejecutarse en un
segundo.

---

## Lo que no está

- **Tests de componentes.** No hay entorno ni librería. El smoke cubre la capa
  de datos; el renderizado sigue sin verificar automáticamente.
- **E2E real.** Sin navegador disponible, las nueve rutas están comprobadas por
  typecheck y lectura, no ejecutadas.
- **Backend real contra PostgreSQL.** El mock es la única fuente ejecutada.
- **Paleta y logo definitivos.** Los tokens de `index.css` están completos pero
  la marca es provisional.
