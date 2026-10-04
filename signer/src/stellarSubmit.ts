import { Keypair, rpc } from "@stellar/stellar-sdk";
import { Client as SmartAccountClient } from "smart-account-kit-bindings";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import type { ContextRule } from "smart-account-kit-bindings";
import type { AppConfig } from "./config.js";
import { SignerError, rpcNoDisponible } from "./errors.js";
import { mapUnknownToSignError } from "./mapSubmitError.js";
import { stellarLookup } from "./resolveTx.js";
import type { SubmitJob, SubmitPayment, SignResponseBody } from "./types.js";
import { assessMandateRule, type ChainSnapshot, type RuleVerdict } from "./verifyRule.js";

type Connectable = {
  setConnectedState(contractId: string, credentialId: string): void;
};

/**
 * Doble de la lectura on-chain, para tests. En producción se usa
 * `kit.rules.get`, `getSpendingLimitData` y `rpc.Server.getLatestLedger`.
 */
export type StellarSubmitDeps = {
  readChain?: (job: SubmitJob) => Promise<ChainSnapshot>;
  transfer?: (job: SubmitJob) => Promise<Omit<SignResponseBody, "proposalId">>;
};

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function amountToNumber(amount: string): number {
  return Number(amount);
}

function isNetwork(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(text);
}

function rejected(verdict: Extract<RuleVerdict, { ok: false }>): Omit<SignResponseBody, "proposalId"> {
  return {
    status: "FALLIDO",
    txHash: null,
    ledger: null,
    submittedAt: null,
    confirmedAt: null,
    error: {
      code: verdict.code,
      contractCode: null,
      stage: "SIMULACION",
      message: verdict.message,
      raw: verdict.raw,
    },
  };
}

function connect(config: AppConfig, job: SubmitJob): SmartAccountKit {
  if (!config.feePayerSecret.startsWith("S")) {
    throw rpcNoDisponible("Falta FEE_PAYER_SECRET para pagar comisiones.");
  }
  let feePayer: Keypair;
  try {
    feePayer = Keypair.fromSecret(config.feePayerSecret);
  } catch {
    throw rpcNoDisponible("FEE_PAYER_SECRET inválido.");
  }

  let kit: SmartAccountKit;
  try {
    kit = new SmartAccountKit({
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      accountWasmHash: config.accountWasmHash,
      webauthnVerifierAddress: config.webauthnVerifierAddress,
      ed25519VerifierAddress: config.ed25519VerifierAddress,
      deployerSecret: feePayer.secret(),
      storage: new MemoryStorage(),
      timeoutInSeconds: config.txTimeoutSeconds,
    });
  } catch (error) {
    throw rpcNoDisponible(error instanceof Error ? error.message : "No se pudo crear el kit.");
  }

  (kit as unknown as Connectable).setConnectedState(job.smartAccountAddress, `sign-${job.memo || "pago"}`);
  kit.wallet = new SmartAccountClient({
    contractId: job.smartAccountAddress,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: feePayer.publicKey(),
  });
  kit.externalSigners.addEd25519FromSecret(job.agentSecret, config.ed25519VerifierAddress);
  return kit;
}

/**
 * Lee la regla de la smart account conectada.
 * `rules.get` simula `get_context_rule` (README del kit: "Read a single rule directly from chain").
 * El tope sale de `SpendingLimitPolicyClient.getSpendingLimitData`.
 * El ledger actual sale de `rpc.Server.getLatestLedger` (Soroban RPC).
 */
async function readChainFromKit(config: AppConfig, kit: SmartAccountKit, job: SubmitJob): Promise<ChainSnapshot> {
  let rule: ContextRule | null;
  try {
    const got = await kit.rules.get(job.contextRuleId);
    rule = got.result ?? null;
  } catch (error) {
    if (isNetwork(error)) {
      throw rpcNoDisponible(error instanceof Error ? error.message : "RPC no disponible.");
    }
    const mapped = mapUnknownToSignError(error, "SIMULACION");
    if (mapped.contractCode === 3000) {
      rule = null;
    } else {
      throw error;
    }
  }

  let latestLedger: number;
  try {
    const latest = await new rpc.Server(config.rpcUrl).getLatestLedger();
    latestLedger = latest.sequence;
  } catch (error) {
    throw rpcNoDisponible(error instanceof Error ? error.message : "No se pudo leer el ledger.");
  }

  let spendingLimitUnits: bigint | null = null;
  if (rule?.policies.includes(config.spendingLimitPolicy)) {
    try {
      const data = await kit.policyClients
        .spendingLimit(config.spendingLimitPolicy)
        .getSpendingLimitData(job.contextRuleId);
      spendingLimitUnits = data.spending_limit;
    } catch (error) {
      if (isNetwork(error)) {
        throw rpcNoDisponible(error instanceof Error ? error.message : "RPC no disponible.");
      }
      spendingLimitUnits = null;
    }
  }

  return { rule, spendingLimitUnits, latestLedger };
}

async function transferWithKit(
  config: AppConfig,
  kit: SmartAccountKit,
  job: SubmitJob,
  signers: NonNullable<ContextRule["signers"]>,
): Promise<Omit<SignResponseBody, "proposalId">> {
  const submittedAt = isoNow();
  const selected = kit.multiSigners.buildSelectedSigners(signers, kit.credentialId);
  const ed25519Only = selected.filter((s) => s.type === "ed25519");
  if (ed25519Only.length === 0) {
    return {
      status: "FALLIDO",
      txHash: null,
      ledger: null,
      submittedAt: null,
      confirmedAt: null,
      error: {
        code: "SIMULACION_FALLIDA",
        contractCode: null,
        stage: "SIMULACION",
        message: "La regla no tiene la llave Ed25519 del agente en este firmante.",
        raw: `selected=${selected.map((s) => s.type).join(",")}`,
      },
    };
  }

  const pay = await kit.multiSigners.transfer(
    job.assetContractId,
    job.destinationAddress,
    amountToNumber(job.amount),
    ed25519Only,
    {
      forceMethod: "rpc",
      resolveContextRuleIds: () => [job.contextRuleId],
    },
  );

  if (pay.success) {
    return {
      status: "CONFIRMADO",
      txHash: pay.hash,
      ledger: pay.ledger ?? null,
      submittedAt,
      confirmedAt: isoNow(),
      error: null,
    };
  }

  const stage = pay.hash ? "CONFIRMACION" : "SIMULACION";
  const mapped = mapUnknownToSignError(pay.error, stage);
  if (pay.hash && mapped.code === "TIMEOUT_CONFIRMACION") {
    const resolved = await stellarLookup(config.rpcUrl)(pay.hash);
    if (resolved === "CONFIRMADO") {
      return {
        status: "CONFIRMADO",
        txHash: pay.hash,
        ledger: null,
        submittedAt,
        confirmedAt: isoNow(),
        error: null,
      };
    }
    if (resolved === "FALLIDO") {
      return {
        status: "FALLIDO",
        txHash: pay.hash,
        ledger: null,
        submittedAt,
        confirmedAt: null,
        error: mapped,
      };
    }
    return {
      status: "ENVIADO",
      txHash: pay.hash,
      ledger: null,
      submittedAt,
      confirmedAt: null,
      error: mapped,
    };
  }
  return {
    status: "FALLIDO",
    txHash: pay.hash ?? null,
    ledger: null,
    submittedAt: pay.hash ? submittedAt : null,
    confirmedAt: null,
    error: mapped,
  };
}

export function createStellarSubmitter(config: AppConfig, deps: StellarSubmitDeps = {}): SubmitPayment {
  return async (job: SubmitJob): Promise<Omit<SignResponseBody, "proposalId">> => {
    try {
      if (deps.readChain) {
        const verdict = assessMandateRule({
          ...(await deps.readChain(job)),
          agentPublicKeyHex: job.agentPublicKeyHex,
          ed25519VerifierAddress: config.ed25519VerifierAddress,
          spendingLimitPolicy: config.spendingLimitPolicy,
          mandateLimitUnits: BigInt(job.dailyLimitUnits),
        });
        if (!verdict.ok) {
          return rejected(verdict);
        }
        if (!deps.transfer) {
          throw rpcNoDisponible("El doble de prueba no define el envío.");
        }
        return await deps.transfer(job);
      }

      const kit = connect(config, job);
      const snapshot = await readChainFromKit(config, kit, job);
      const verdict = assessMandateRule({
        ...snapshot,
        agentPublicKeyHex: job.agentPublicKeyHex,
        ed25519VerifierAddress: config.ed25519VerifierAddress,
        spendingLimitPolicy: config.spendingLimitPolicy,
        mandateLimitUnits: BigInt(job.dailyLimitUnits),
      });
      if (!verdict.ok) {
        return rejected(verdict);
      }
      return await transferWithKit(config, kit, job, snapshot.rule?.signers ?? []);
    } catch (error) {
      if (error instanceof SignerError) {
        throw error;
      }
      const text = error instanceof Error ? error.message : String(error);
      if (isNetwork(error)) {
        throw rpcNoDisponible(text);
      }
      return {
        status: "FALLIDO",
        txHash: null,
        ledger: null,
        submittedAt: null,
        confirmedAt: null,
        error: mapUnknownToSignError(error, "SIMULACION"),
      };
    }
  };
}
