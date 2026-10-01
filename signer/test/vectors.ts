/**
 * Secreto maestro de PRUEBA (32 bytes ASCII). Nunca usar en un .env real.
 * base64("riendas-test-master-secret-v1!!!")
 */
export const TEST_MASTER_SECRET_B64 = "cmllbmRhcy10ZXN0LW1hc3Rlci1zZWNyZXQtdjEhISE=";
export const TEST_MASTER_SECRET = Buffer.from("riendas-test-master-secret-v1!!!", "utf8");

export const TEST_SERVICE_KEY = "test-service-key";

export const TEST_VERIFIER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";
export const TEST_USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const TEST_WASM = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
export const TEST_DESTINATION = `G${"A".repeat(55)}`;

/** Direcciones C... que cumplen el regex del contrato. No son cuentas reales de testnet. */
export const ACCOUNT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const ACCOUNT_B = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

export const ACCOUNT_A_V1_HEX = "a145adc206bdf8237d2c825814d0d50208ab2397a151c1b768d37d14386d0150";
export const PROPOSAL_ID = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
