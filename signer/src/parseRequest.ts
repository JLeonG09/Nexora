import { solicitudInvalida } from "./errors.js";
import { assertAmountMatchesUnits } from "./money.js";
import type { ParsedSignRequest } from "./types.js";

const SMART_ACCOUNT = /^C[A-Z2-7]{55}$/;
const STELLAR_ADDRESS = /^[GC][A-Z2-7]{55}$/;
const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PUBKEY_HEX = /^[0-9a-fA-F]{64}$/;

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw solicitudInvalida(`Falta ${name}.`);
  }
  return value.trim();
}

function asInt(value: unknown, name: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw solicitudInvalida(`${name} debe ser un entero mayor o igual a ${min}.`);
  }
  return value;
}

export function parseSignRequest(body: unknown, usdcContractId: string): ParsedSignRequest {
  if (body === null || typeof body !== "object") {
    throw solicitudInvalida("El cuerpo debe ser un JSON.");
  }
  const raw = body as Record<string, unknown>;
  const proposalId = asString(raw.proposalId, "proposalId");
  if (!UUID.test(proposalId)) {
    throw solicitudInvalida("proposalId debe ser un UUID.");
  }
  const smartAccountAddress = asString(raw.smartAccountAddress, "smartAccountAddress");
  if (!SMART_ACCOUNT.test(smartAccountAddress)) {
    throw solicitudInvalida("smartAccountAddress debe ser C + 55 caracteres A-Z2-7.");
  }
  const contextRuleId = asInt(raw.contextRuleId, "contextRuleId", 0);
  const keyVersion = asInt(raw.keyVersion, "keyVersion", 1);
  const agentPublicKeyHex = asString(raw.agentPublicKeyHex, "agentPublicKeyHex").toLowerCase();
  if (!PUBKEY_HEX.test(agentPublicKeyHex)) {
    throw solicitudInvalida("agentPublicKeyHex debe ser 64 caracteres hex.");
  }
  const destinationAddress = asString(raw.destinationAddress, "destinationAddress");
  if (!STELLAR_ADDRESS.test(destinationAddress)) {
    throw solicitudInvalida("destinationAddress debe ser G... o C....");
  }
  const amount = asString(raw.amount, "amount");
  const amountUnits = asString(raw.amountUnits, "amountUnits");
  assertAmountMatchesUnits(amount, amountUnits);
  const assetContractId = asString(raw.assetContractId, "assetContractId");
  if (!SMART_ACCOUNT.test(assetContractId)) {
    throw solicitudInvalida("assetContractId debe ser un contrato C....");
  }
  if (assetContractId !== usdcContractId) {
    throw solicitudInvalida("assetContractId no es el USDC de testnet configurado.");
  }
  const memo = typeof raw.memo === "string" ? raw.memo : "";
  const dailyLimitUnits = asString(raw.dailyLimitUnits, "dailyLimitUnits");
  if (!/^[0-9]+$/.test(dailyLimitUnits) || BigInt(dailyLimitUnits) <= 0n) {
    throw solicitudInvalida(
      "dailyLimitUnits debe ser un entero positivo en unidades de 7 decimales.",
    );
  }

  return {
    proposalId,
    smartAccountAddress,
    contextRuleId,
    keyVersion,
    agentPublicKeyHex,
    destinationAddress,
    amount,
    amountUnits,
    assetContractId,
    memo,
    dailyLimitUnits,
  };
}
