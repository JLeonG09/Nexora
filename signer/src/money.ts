import { solicitudInvalida } from "./errors.js";

const AMOUNT_RE = /^[0-9]+(\.[0-9]{1,7})?$/;

export function unitsFromAmount(amount: string): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  return BigInt(whole + frac.padEnd(7, "0"));
}

export function assertAmountMatchesUnits(amount: string, amountUnits: string): void {
  if (!AMOUNT_RE.test(amount)) {
    throw solicitudInvalida("amount debe ser un decimal positivo con hasta 7 decimales.");
  }
  if (!/^[0-9]+$/.test(amountUnits)) {
    throw solicitudInvalida("amountUnits debe ser un entero en string.");
  }
  if (unitsFromAmount(amount) !== BigInt(amountUnits)) {
    throw solicitudInvalida("amountUnits no corresponde a amount × 10^7.");
  }
}
