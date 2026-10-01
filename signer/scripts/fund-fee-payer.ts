/**
 * Crea una cuenta G de testnet y la fondea con Friendbot.
 * Sirve para pagar comisiones del spike D2. No es la llave del agente.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";

const envPath = resolve(import.meta.dirname, "../.env");
const env = readFileSync(envPath, "utf8");

const existing = /(?:^|\n)FEE_PAYER_SECRET=(S[A-Z2-7]{55})/.exec(env);
if (existing) {
  const pair = Keypair.fromSecret(existing[1]!);
  console.log(`Ya hay FEE_PAYER_SECRET. Dirección: ${pair.publicKey()}`);
  process.exit(0);
}

const pair = Keypair.random();
const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(pair.publicKey())}`;
const response = await fetch(url);
if (!response.ok) {
  console.error(`Friendbot falló: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const next = env.includes("FEE_PAYER_SECRET=")
  ? env.replace(/FEE_PAYER_SECRET=.*/, `FEE_PAYER_SECRET=${pair.secret()}`)
  : `${env.trimEnd()}\nFEE_PAYER_SECRET=${pair.secret()}\n`;

writeFileSync(envPath, next);
console.log(`Cuenta fondeada (testnet). Dirección: ${pair.publicKey()}`);
console.log("El secreto S... quedó en signer/.env (no lo subas, no lo pegues en el chat).");
