/**
 * Segunda cuenta G de testnet (Friendbot + trustline USDC) para reintentar Circle.
 * No pisa FEE_PAYER_SECRET. Guarda SPIKE_USDC_SECRET en .env.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const HORIZON = "https://horizon-testnet.stellar.org";
const envPath = resolve(import.meta.dirname, "../.env");

function upsertSecret(env: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  if (env.includes(`${key}=`)) {
    return env.replace(new RegExp(`${key}=.*`), line);
  }
  return `${env.trimEnd()}\n${line}\n`;
}

let env = readFileSync(envPath, "utf8");
const existing = /(?:^|\n)SPIKE_USDC_SECRET=(S[A-Z2-7]{55})/.exec(env)?.[1];
const pair = existing ? Keypair.fromSecret(existing) : Keypair.random();

if (!existing) {
  const fund = await fetch(
    `https://friendbot.stellar.org/?addr=${encodeURIComponent(pair.publicKey())}`,
  );
  if (!fund.ok) {
    console.error(`Friendbot falló: ${fund.status} ${await fund.text()}`);
    process.exit(1);
  }
  env = upsertSecret(env, "SPIKE_USDC_SECRET", pair.secret());
  writeFileSync(envPath, env);
  console.log("Cuenta nueva fondeada con XLM. Secreto en SPIKE_USDC_SECRET (.env).");
} else {
  console.log("Ya existía SPIKE_USDC_SECRET. Reuso esa cuenta.");
}

const server = new Horizon.Server(HORIZON);
const account = await server.loadAccount(pair.publicKey());
const already = account.balances.some(
  (b) =>
    "asset_code" in b &&
    b.asset_code === "USDC" &&
    "asset_issuer" in b &&
    b.asset_issuer === USDC_ISSUER,
);

if (!already) {
  const usdc = new Asset("USDC", USDC_ISSUER);
  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build();
  tx.sign(pair);
  const result = await server.submitTransaction(tx);
  console.log(`Trustline USDC creada. tx=${result.hash}`);
} else {
  console.log("Trustline USDC ya estaba.");
}

console.log(`Dirección para Circle: ${pair.publicKey()}`);
