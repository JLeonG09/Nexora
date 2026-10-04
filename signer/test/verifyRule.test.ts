import type { ContextRule, Signer } from "smart-account-kit-bindings";
import { describe, expect, it } from "vitest";
import { createStellarSubmitter } from "../src/stellarSubmit.js";
import type { SubmitJob } from "../src/types.js";
import { testConfig } from "./helpers.js";
import { ACCOUNT_A, ACCOUNT_A_V1_HEX, TEST_DESTINATION, TEST_USDC, TEST_VERIFIER } from "./vectors.js";

const POLICY = testConfig.spendingLimitPolicy;
const LEDGER = 1_000_000;
const MANDATE_UNITS = 500_000_000n;

function signer(hex: string, verifier = TEST_VERIFIER): Signer {
  return { tag: "External", values: [verifier, Buffer.from(hex, "hex")] };
}

function rule(overrides: Partial<ContextRule> = {}): ContextRule {
  return {
    context_type: { tag: "CallContract", values: [TEST_USDC] },
    id: 1,
    name: "agente",
    policies: [POLICY],
    policy_ids: [1],
    signer_ids: [1],
    signers: [signer(ACCOUNT_A_V1_HEX)],
    valid_until: LEDGER + 100,
    ...overrides,
  };
}

function job(): SubmitJob {
  return {
    smartAccountAddress: ACCOUNT_A,
    contextRuleId: 1,
    destinationAddress: TEST_DESTINATION,
    amount: "10.0000000",
    assetContractId: TEST_USDC,
    memo: "prueba",
    agentSecret: "S".padEnd(56, "A"),
    agentPublicKeyHex: ACCOUNT_A_V1_HEX,
    dailyLimitUnits: MANDATE_UNITS.toString(),
  };
}

const confirmed = {
  status: "CONFIRMADO" as const,
  txHash: "ab".repeat(32),
  ledger: LEDGER,
  submittedAt: "2026-10-03T18:00:00Z",
  confirmedAt: "2026-10-03T18:00:04Z",
  error: null,
};

async function submit(snapshot: {
  rule: ContextRule | null;
  spendingLimitUnits: bigint | null;
  latestLedger?: number;
}) {
  let transfers = 0;
  const run = createStellarSubmitter(testConfig, {
    readChain: async () => ({
      rule: snapshot.rule,
      spendingLimitUnits: snapshot.spendingLimitUnits,
      latestLedger: snapshot.latestLedger ?? LEDGER,
    }),
    transfer: async () => {
      transfers += 1;
      return confirmed;
    },
  });
  const result = await run(job());
  return { result, transfers };
}

describe("verificación on-chain de la regla", () => {
  it("rechaza una regla sin política de spending-limit y no firma", async () => {
    const { result, transfers } = await submit({
      rule: rule({ policies: [], policy_ids: [] }),
      spendingLimitUnits: null,
    });
    expect(result.status).toBe("FALLIDO");
    expect(result.error?.code).toBe("REGLA_SIN_POLITICA");
    expect(result.txHash).toBeNull();
    expect(transfers).toBe(0);
  });

  it("rechaza una regla que no tiene la llave del agente y no firma", async () => {
    const { result, transfers } = await submit({
      rule: rule({ signers: [signer("ab".repeat(32))], signer_ids: [1] }),
      spendingLimitUnits: 100_000_000n,
    });
    expect(result.status).toBe("FALLIDO");
    expect(result.error?.code).toBe("REGLA_NO_COINCIDE");
    expect(transfers).toBe(0);
  });

  it("rechaza una regla vencida y no firma", async () => {
    const { result, transfers } = await submit({
      rule: rule({ valid_until: LEDGER - 1 }),
      spendingLimitUnits: 100_000_000n,
      latestLedger: LEDGER,
    });
    expect(result.status).toBe("FALLIDO");
    expect(result.error?.code).toBe("REGLA_VENCIDA");
    expect(transfers).toBe(0);
  });

  it("rechaza un tope on-chain mayor que el del mandato y no firma", async () => {
    const { result, transfers } = await submit({
      rule: rule(),
      spendingLimitUnits: MANDATE_UNITS + 1n,
    });
    expect(result.status).toBe("FALLIDO");
    expect(result.error?.code).toBe("REGLA_NO_COINCIDE");
    expect(result.error?.message).toMatch(/tope on-chain/i);
    expect(transfers).toBe(0);
  });

  it("firma cuando la regla coincide y el tope on-chain no supera al mandato", async () => {
    const { result, transfers } = await submit({
      rule: rule(),
      spendingLimitUnits: MANDATE_UNITS,
    });
    expect(result.status).toBe("CONFIRMADO");
    expect(result.txHash).toBe(confirmed.txHash);
    expect(transfers).toBe(1);
  });

  it("rechaza si la regla no existe en la smart account", async () => {
    const { result, transfers } = await submit({ rule: null, spendingLimitUnits: null });
    expect(result.error?.code).toBe("REGLA_NO_COINCIDE");
    expect(transfers).toBe(0);
  });
});
