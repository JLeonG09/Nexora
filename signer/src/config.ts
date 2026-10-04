import { config as loadDotenv } from "dotenv";
import { unitsFromAmount } from "./money.js";

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
  /** Contrato de la política spending-limit que tiene que estar en la regla. */
  spendingLimitPolicy: string;
  /** Tope por transacción del firmante, en unidades de 7 decimales. */
  maxAmountPerTx: bigint;
  /** Tope acumulado del período, en unidades de 7 decimales. */
  maxAmountPerPeriod: bigint;
  periodHours: number;
};

/** Política spending-limit de testnet que usa el spike del proyecto. */
export const DEFAULT_SPENDING_LIMIT_POLICY =
  "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G";

const STELLAR_C_OR_G = /^[GC][A-Z2-7]{55}$/;
const USDC_AMOUNT = /^[0-9]+(\.[0-9]{1,7})?$/;

/**
 * 100 USDC por transacción y 500 USDC cada 24 h.
 * En testnet es poco para que una clave de servicio filtrada no mueva un monto grande,
 * y queda por encima del mandato de la demo (25 por pago, 45 al día) para no frenarla.
 */
export const DEFAULT_MAX_AMOUNT_PER_TX = "100";
export const DEFAULT_MAX_AMOUNT_PER_PERIOD = "500";
export const DEFAULT_PERIOD_HOURS = 24;

function parsePositiveUnits(raw: string, name: string): bigint {
  const trimmed = raw.trim();
  if (!USDC_AMOUNT.test(trimmed)) {
    throw new Error(`${name} debe ser un monto positivo con hasta 7 decimales.`);
  }
  const units = unitsFromAmount(trimmed);
  if (units <= 0n) {
    throw new Error(`${name} debe ser mayor que 0.`);
  }
  return units;
}

/** Misma regla que StartupSecretsCheck del backend: largo mínimo y denylist. */
const MIN_SERVICE_KEY_LENGTH = 32;
const SERVICE_KEY_DENYLIST = new Set([
  "cambia-esto",
  "changeme",
  "change-me",
  "change_me",
  "password",
  "secret",
  "nexora_dev",
  "riendas_dev",
]);
const SERVICE_KEY_PREFIXES = ["cambia-esto", "changeme", "change-me", "change_me"];

export function isWeakServiceKey(secret: string | undefined): boolean {
  const value = secret?.trim() ?? "";
  if (value.length < MIN_SERVICE_KEY_LENGTH || value.startsWith("<")) {
    return true;
  }
  const normalized = value.toLowerCase();
  if (SERVICE_KEY_DENYLIST.has(normalized)) {
    return true;
  }
  return SERVICE_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

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
  const spendingLimitPolicy = env.SPENDING_LIMIT_POLICY?.trim() || DEFAULT_SPENDING_LIMIT_POLICY;
  const maxAmountPerTx = parsePositiveUnits(
    env.MAX_AMOUNT_PER_TX?.trim() || DEFAULT_MAX_AMOUNT_PER_TX,
    "MAX_AMOUNT_PER_TX",
  );
  const maxAmountPerPeriod = parsePositiveUnits(
    env.MAX_AMOUNT_PER_PERIOD?.trim() || DEFAULT_MAX_AMOUNT_PER_PERIOD,
    "MAX_AMOUNT_PER_PERIOD",
  );
  const periodHours = Number(env.PERIOD_HOURS ?? String(DEFAULT_PERIOD_HOURS));

  if (serviceKey === undefined || isWeakServiceKey(serviceKey)) {
    throw new Error(
      "SIGNER_SERVICE_KEY debe tener al menos 32 caracteres y no ser un valor de ejemplo.",
    );
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
  if (!STELLAR_C_OR_G.test(spendingLimitPolicy) || !spendingLimitPolicy.startsWith("C")) {
    throw new Error("SPENDING_LIMIT_POLICY inválido o faltante.");
  }
  if (!Number.isInteger(periodHours) || periodHours < 1) {
    throw new Error("PERIOD_HOURS debe ser un entero mayor o igual a 1.");
  }
  if (maxAmountPerTx > maxAmountPerPeriod) {
    throw new Error("MAX_AMOUNT_PER_TX no puede ser mayor que MAX_AMOUNT_PER_PERIOD.");
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
    spendingLimitPolicy,
    maxAmountPerTx,
    maxAmountPerPeriod,
    periodHours,
  };
}
