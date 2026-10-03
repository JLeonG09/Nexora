import type { AppConfig } from "../src/config.js";
import {
  TEST_MASTER_SECRET,
  TEST_SERVICE_KEY,
  TEST_USDC,
  TEST_VERIFIER,
  TEST_WASM,
} from "./vectors.js";

export const testConfig: AppConfig = {
  port: 3001,
  serviceKey: TEST_SERVICE_KEY,
  masterSecret: TEST_MASTER_SECRET,
  ed25519VerifierAddress: TEST_VERIFIER,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  usdcContractId: TEST_USDC,
  accountWasmHash: TEST_WASM,
  webauthnVerifierAddress: TEST_VERIFIER,
  feePayerSecret: "",
  txTimeoutSeconds: 60,
  spendingLimitPolicy: "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G",
};
