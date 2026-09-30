/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base del backend, p. ej. `http://localhost:8080` o `https://api.nexora.io`.
   * Vacio = rutas relativas, resueltas por el proxy de Vite en desarrollo.
   */
  readonly VITE_API_URL?: string
  /**
   * `true` = datos de mentira, sin backend. Por defecto se activa solo
   * cuando `VITE_API_URL` esta vacio.
   */
  readonly VITE_MOCK?: string
  /** Red Stellar usada para los enlaces al explorador. `testnet` | `public`. */
  readonly VITE_STELLAR_NETWORK?: 'testnet' | 'public'
  /** Destino del proxy de Vite en desarrollo. Default `http://localhost:8080`. */
  readonly VITE_DEV_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
