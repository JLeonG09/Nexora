import type { ContextRule, Signer } from "smart-account-kit-bindings";

/**
 * Lo que se lee de la smart account antes de firmar.
 * `kit.rules.get` devuelve {@link ContextRule} (`policies`, `signers`, `valid_until`).
 * El monto del spending-limit no está en la regla: lo devuelve
 * `kit.policyClients.spendingLimit(dirección).getSpendingLimitData(id).spending_limit`
 * (unidades del token, 7 decimales en USDC).
 */
export type ChainSnapshot = {
  rule: ContextRule | null;
  spendingLimitUnits: bigint | null;
  latestLedger: number;
};

export type RuleCode = "REGLA_SIN_POLITICA" | "REGLA_NO_COINCIDE" | "REGLA_VENCIDA";

export type RuleVerdict =
  | { ok: true }
  | { ok: false; code: RuleCode; message: string; raw: string };

export type MandateRuleFacts = ChainSnapshot & {
  agentPublicKeyHex: string;
  ed25519VerifierAddress: string;
  spendingLimitPolicy: string;
  mandateLimitUnits: bigint;
};

function fail(code: RuleCode, message: string, raw: string): RuleVerdict {
  return { ok: false, code, message, raw };
}

/** La pública del agente es un signer External(verificador Ed25519, 32 bytes). */
function hasAgentKey(signers: readonly Signer[], verifier: string, publicKeyHex: string): boolean {
  const want = publicKeyHex.toLowerCase();
  for (const signer of signers) {
    if (signer.tag !== "External") {
      continue;
    }
    const address = signer.values[0];
    const keyData = signer.values[1];
    if (address !== verifier || keyData === undefined) {
      continue;
    }
    if (Buffer.from(keyData).toString("hex").toLowerCase() === want) {
      return true;
    }
  }
  return false;
}

/**
 * La regla de esa smart account tiene que coincidir con el mandato:
 * existe, incluye la pública del agente, tiene la política de spending-limit,
 * `valid_until` sigue vigente (mayor o igual al ledger actual) y el tope
 * on-chain no supera el del mandato.
 */
export function assessMandateRule(facts: MandateRuleFacts): RuleVerdict {
  const rule = facts.rule;
  if (!rule) {
    return fail(
      "REGLA_NO_COINCIDE",
      "La regla no existe en esa smart account.",
      "rules.get sin resultado",
    );
  }
  if (!hasAgentKey(rule.signers, facts.ed25519VerifierAddress, facts.agentPublicKeyHex)) {
    return fail(
      "REGLA_NO_COINCIDE",
      "La regla no contiene la llave Ed25519 del agente de esta versión.",
      "signers sin la pública del agente",
    );
  }
  if (!rule.policies.includes(facts.spendingLimitPolicy)) {
    return fail(
      "REGLA_SIN_POLITICA",
      "La regla no tiene la política de spending-limit.",
      `policies=${rule.policies.join(",")}`,
    );
  }
  const until = rule.valid_until;
  if (until === undefined || until < facts.latestLedger) {
    return fail(
      "REGLA_VENCIDA",
      "La regla no tiene un valid_until vigente.",
      `valid_until=${String(until)} ledger=${facts.latestLedger}`,
    );
  }
  if (facts.spendingLimitUnits === null || facts.spendingLimitUnits <= 0n) {
    return fail(
      "REGLA_SIN_POLITICA",
      "No se pudo leer un spending-limit positivo de la política.",
      "getSpendingLimitData vacío",
    );
  }
  if (facts.spendingLimitUnits > facts.mandateLimitUnits) {
    return fail(
      "REGLA_NO_COINCIDE",
      "El tope on-chain de la política es mayor que el tope del mandato.",
      `onchain=${facts.spendingLimitUnits} mandato=${facts.mandateLimitUnits}`,
    );
  }
  return { ok: true };
}
