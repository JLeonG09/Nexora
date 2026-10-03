/**
 * Ensayo del modo atacante, solo del firmante: pide 60 USDC (tope on-chain 50).
 * Tiene que terminar FALLIDO / SpendingLimitExceeded y no mover plata.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "../src/config.js";
import { deriveAgentKey } from "../src/deriveKey.js";
import { createStellarSubmitter } from "../src/stellarSubmit.js";

const envPath = resolve(import.meta.dirname, "../.env");
const env = readFileSync(envPath, "utf8");

function envValue(key: string): string | undefined {
  return new RegExp(`(?:^|\\n)${key}=([^\\n]+)`).exec(env)?.[1]?.trim();
}

const smartAccount = envValue("SPIKE_SMART_ACCOUNT");
const holderSecret = envValue("SPIKE_USDC_SECRET");
if (!smartAccount?.startsWith("C") || !holderSecret?.startsWith("S")) {
  console.error("Faltan SPIKE_SMART_ACCOUNT y SPIKE_USDC_SECRET en signer/.env (el ensayo del D2).");
  process.exit(1);
}

const config = loadConfig();
const destination = Keypair.fromSecret(holderSecret).publicKey();
const agent = deriveAgentKey(config.masterSecret, smartAccount, 1);

console.log(`Caja: ${smartAccount}`);
console.log(`Agente: ${agent.address}`);
console.log(`Destino: ${destination}`);
console.log("Pidiendo 60 USDC (el tope de la regla es 50)...");

const result = await createStellarSubmitter(config)({
  smartAccountAddress: smartAccount,
  contextRuleId: 1,
  destinationAddress: destination,
  amount: "60",
  assetContractId: config.usdcContractId,
  memo: "rehearse-limit",
  agentSecret: agent.keypair.secret(),
  agentPublicKeyHex: agent.publicKeyHex,
  dailyLimitUnits: "500000000",
});

console.log(JSON.stringify({ status: result.status, txHash: result.txHash, error: result.error }, null, 2));
if (result.status === "CONFIRMADO") {
  console.error("La red aceptó 60 USDC. El tope no frenó el pago.");
  process.exit(1);
}
if (result.error?.code !== "SpendingLimitExceeded") {
  if (result.error?.raw.includes("balance is not sufficient")) {
    console.log(
      "La caja no llega a 60 USDC, así que el token frenó antes que el tope de 50. Para ver SpendingLimitExceeded hay que tener más de 50 USDC en la caja.",
    );
  }
  process.exit(2);
}
console.log("OK: la red frenó el pago y no se movió plata.");
