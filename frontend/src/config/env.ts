/**
 * Configuracion de la aplicacion, leida de las variables de entorno de Vite.
 *
 * Vite solo expone al navegador las variables con prefijo `VITE_`, y las
 * tipa en `vite-env.d.ts`. Este archivo es el UNICO lugar donde se decide
 * a que backend se habla y si se usan datos de mentira.
 */

/** Base de la API. Vacio = mismo origen (util con el proxy de Vite). */
const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim()

/**
 * Si `VITE_API_URL` esta vacio, el cliente usa rutas relativas (`/api/...`).
 * En desarrollo eso lo resuelve el proxy de `vite.config.ts` contra
 * `http://localhost:8080`, asi que no hay CORS ni URLs absolutas por ahi.
 */
export const API_BASE = rawApiUrl.replace(/\/+$/, '')

/**
 * Prefijo de la API. El backend Nexora NO versiona por ruta: sus
 * controladores cuelgan directamente de `/api/**` (`/api/chat`,
 * `/api/approvals`, `/api/health`...). No anadir `/v1`.
 */
export const API_PREFIX = `${API_BASE}/api`

/**
 * Modo mock: no se habla con NINGUN backend. Todas las peticiones se
 * resuelven contra los datos de `src/api/mock/`, con latencia simulada.
 *
 * Prioridad: la variable de entorno gana; si no esta, el mock se activa solo
 * cuando no hay backend configurado. Asi un `git clone` + `pnpm dev`
 * levanta la app completa sin tener Spring Boot con PostgreSQL levantado.
 */
export const MOCK_ENABLED =
  (import.meta.env.VITE_MOCK ?? (API_BASE === '' ? 'true' : 'false')) === 'true'

/**
 * Llave de servicio para `/api/agent-tools/**`.
 *
 * Ese grupo de endpoints NO lo consume el panel: lo consume el agente de IA
 * desde fuera, y por eso exige `X-Service-Key`. Si este panel llegara a
 * llamarlos, mandaria la llave del usuario al sitio equivocado. Se expone
 * la URL para poder avisar, pero no se envia la llave desde aqui.
 */
export const AGENT_TOOLS_ENABLED =
  (import.meta.env.VITE_AGENT_TOOLS ?? 'false') === 'true'

/**
 * Login con Privy (correo con codigo o Google). Solo se activa si hay App ID.
 * El backend valida el access token: sin Privy, el alta a mano solo sirve
 * con datos de prueba (`VITE_MOCK`).
 */
export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? '').trim()
export const PRIVY_CLIENT_ID = (import.meta.env.VITE_PRIVY_CLIENT_ID ?? '').trim() || undefined
export const PRIVY_ENABLED = PRIVY_APP_ID !== ''

/** Red Stellar por defecto. El backend solo admite TESTNET por ahora. */
export const STELLAR_NETWORK: 'TESTNET' | 'PUBLIC' =
  (import.meta.env.VITE_STELLAR_NETWORK ?? '').toUpperCase() === 'PUBLIC' ? 'PUBLIC' : 'TESTNET'

/**
 * Base del explorador (Stellar Expert) para abrir una transaccion o un
 * contrato. El backend ya devuelve las URLs completas en `explorerUrl`;
 * esto solo se usa para los casos en los que no las trae.
 */
export const STELLAR_EXPLORER =
  STELLAR_NETWORK === 'PUBLIC'
    ? 'https://stellar.expert/explorer/public'
    : 'https://stellar.expert/explorer/testnet'
