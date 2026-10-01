/**
 * Abre trustline de USDC testnet en FEE_PAYER (cuenta G).
 * Circle no puede mandar USDC si esta línea no existe.
 */
import { readFileSync } from "node:fs";
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

const env = readFileSync(resolve(import.meta.dirname, "../.env"), "utf8");
const secret = /(?:^|\n)FEE_PAYER_SECRET=(S[A-Z2-7]{55})/.exec(env)?.[1];
if (!secret) {
  console.error("Falta FEE_PAYER_SECRET real en signer/.env");
  process.exit(1);
}

const pair = Keypair.fromSecret(secret);
const server = new Horizon.Server(HORIZON);
const account = await server.loadAccount(pair.publicKey());

const already = account.balances.some(
  (b) =>
    "asset_code" in b &&
    b.asset_code === "USDC" &&
    "asset_issuer" in b &&
    b.asset_issuer === USDC_ISSUER,
);
if (already) {
  console.log(`Trustline USDC ya existe en ${pair.publicKey()}`);
  process.exit(0);
}

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
console.log(`Cuenta: ${pair.publicKey()}`);
console.log("Ahora sí: faucet Circle → Stellar Testnet → esa G... → Send 20 USDC");
