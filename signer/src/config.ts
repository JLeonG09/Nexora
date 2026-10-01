import { config as loadDotenv } from "dotenv";

loadDotenv();

export type AppConfig = {
  port: number;
  serviceKey: string;
  masterSecret: Buffer;
  ed25519VerifierAddress: string;
  rpcUrl: string;
  networkPassphrase: string;
  usdcContractId: string;
  accountWasmHash: string;
  webauthnVerifierAddress: string;
  feePayerSecret: string;
  txTimeoutSeconds: number;
};

const STELLAR_C_OR_G = /^[GC][A-Z2-7]{55}$/;

export function decodeMasterSecret(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("AGENT_MASTER_SECRET está vacío.");
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0 && trimmed.length >= 64) {
    const hex = Buffer.from(trimmed, "hex");
    if (hex.length >= 32) {
      return hex;
    }
  }

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length < 32) {
    throw new Error("AGENT_MASTER_SECRET debe decodificar a 32 bytes o más (base64 o hex).");
  }
  return base64;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const serviceKey = env.SIGNER_SERVICE_KEY?.trim();
  const masterRaw = env.AGENT_MASTER_SECRET?.trim();
  const verifier = env.ED25519_VERIFIER_ADDRESS?.trim();
  const webauthn = env.WEBAUTHN_VERIFIER_ADDRESS?.trim();
  const usdc = env.USDC_CONTRACT_ID?.trim();
  const wasmHash = env.ACCOUNT_WASM_HASH?.trim();
  const rpcUrl = env.STELLAR_RPC_URL?.trim() || "https://soroban-testnet.stellar.org";
  const networkPassphrase =
    env.STELLAR_NETWORK_PASSPHRASE?.trim() || "Test SDF Network ; September 2015";
  const feePayerSecret = env.FEE_PAYER_SECRET?.trim() ?? "";
  const txTimeoutSeconds = Number(env.TX_TIMEOUT_SECONDS ?? "60");
  const port = Number(env.PORT ?? "3001");

  if (!serviceKey || serviceKey.includes("<")) {
    throw new Error("Falta SIGNER_SERVICE_KEY en el .env");
  }
  if (!masterRaw || masterRaw.includes("<")) {
    throw new Error("Falta AGENT_MASTER_SECRET en el .env");
  }
  if (!verifier || !STELLAR_C_OR_G.test(verifier)) {
    throw new Error("ED25519_VERIFIER_ADDRESS inválido o faltante.");
  }
  if (!webauthn || !STELLAR_C_OR_G.test(webauthn)) {
    throw new Error("WEBAUTHN_VERIFIER_ADDRESS inválido o faltante.");
  }
  if (!usdc || !STELLAR_C_OR_G.test(usdc) || !usdc.startsWith("C")) {
    throw new Error("USDC_CONTRACT_ID inválido o faltante.");
  }
  if (!wasmHash || !/^[0-9a-fA-F]{64}$/.test(wasmHash)) {
    throw new Error("ACCOUNT_WASM_HASH inválido o faltante.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT inválido.");
  }
  if (!Number.isInteger(txTimeoutSeconds) || txTimeoutSeconds < 1) {
    throw new Error("TX_TIMEOUT_SECONDS inválido.");
  }

  return {
    port,
    serviceKey,
    masterSecret: decodeMasterSecret(masterRaw),
    ed25519VerifierAddress: verifier,
    rpcUrl,
    networkPassphrase,
    usdcContractId: usdc,
    accountWasmHash: wasmHash,
    webauthnVerifierAddress: webauthn,
    feePayerSecret: feePayerSecret.includes("<") ? "" : feePayerSecret,
    txTimeoutSeconds,
  };
}
