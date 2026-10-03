import { Keypair } from "@stellar/stellar-sdk";
import { Client as SmartAccountClient } from "smart-account-kit-bindings";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import type { AppConfig } from "./config.js";
import { rpcNoDisponible } from "./errors.js";
import { mapUnknownToSignError } from "./mapSubmitError.js";
import { stellarLookup } from "./resolveTx.js";
import type { SubmitJob, SubmitPayment, SignResponseBody } from "./types.js";

type Connectable = {
  setConnectedState(contractId: string, credentialId: string): void;
};

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function amountToNumber(amount: string): number {
  return Number(amount);
}

export function createStellarSubmitter(config: AppConfig): SubmitPayment {
  return async (job: SubmitJob): Promise<Omit<SignResponseBody, "proposalId">> => {
    if (!config.feePayerSecret.startsWith("S")) {
      throw rpcNoDisponible("Falta FEE_PAYER_SECRET para pagar comisiones.");
    }

    const submittedAt = isoNow();
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

    try {
      (kit as unknown as Connectable).setConnectedState(
        job.smartAccountAddress,
        `sign-${job.memo || "pago"}`,
      );
      kit.wallet = new SmartAccountClient({
        contractId: job.smartAccountAddress,
        networkPassphrase: config.networkPassphrase,
        rpcUrl: config.rpcUrl,
        publicKey: feePayer.publicKey(),
      });
      kit.externalSigners.addEd25519FromSecret(job.agentSecret, config.ed25519VerifierAddress);

      const rule = await kit.rules.get(job.contextRuleId);
      const signers = rule.result?.signers;
      if (!signers?.length) {
        return {
          status: "FALLIDO",
          txHash: null,
          ledger: null,
          submittedAt: null,
          confirmedAt: null,
          error: {
            code: "REGLA_EXPIRADA_O_INEXISTENTE",
            contractCode: 3000,
            stage: "SIMULACION",
            message: "La regla del mandato no existe o ya venció.",
            raw: `rules.get(${job.contextRuleId}) sin signers`,
          },
        };
      }

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
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(text)) {
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
