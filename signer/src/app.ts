import express, { type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "./config.js";
import { requireServiceKey } from "./auth.js";
import { deriveAgentKey } from "./deriveKey.js";
import { SignerError, noEncontrado, solicitudInvalida } from "./errors.js";
import { handleSignAndSubmit } from "./signAndSubmit.js";
import { createProposalStore, type ProposalStore } from "./store.js";
import { applyResolution, stellarLookup, type LookupTransaction } from "./resolveTx.js";
import { createStellarSubmitter } from "./stellarSubmit.js";
import type { SubmitPayment } from "./types.js";

const SMART_ACCOUNT = /^C[A-Z2-7]{55}$/;
const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type AppDeps = {
  submitPayment?: SubmitPayment;
  store?: ProposalStore;
  /** Si no se pasa y el envío es el real, se consulta el RPC de Stellar. */
  lookupTransaction?: LookupTransaction;
};

export function createApp(config: AppConfig, deps: AppDeps = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(requireServiceKey(config.serviceKey));

  const store = deps.store ?? createProposalStore();
  const submitPayment =
    deps.submitPayment ??
    (config.feePayerSecret.startsWith("S") ? createStellarSubmitter(config) : undefined);
  const lookupTransaction =
    deps.lookupTransaction ?? (deps.submitPayment ? undefined : stellarLookup(config.rpcUrl));

  app.get("/agent-key", (req, res, next) => {
    try {
      const smartAccountAddress = String(req.query.smartAccountAddress ?? "");
      const keyVersionRaw = String(req.query.keyVersion ?? "");
      const keyVersion = Number(keyVersionRaw);

      if (!SMART_ACCOUNT.test(smartAccountAddress)) {
        throw solicitudInvalida("smartAccountAddress debe ser C + 55 caracteres A-Z2-7.");
      }
      if (!Number.isInteger(keyVersion) || keyVersion < 1) {
        throw solicitudInvalida("keyVersion debe ser un entero mayor o igual a 1.");
      }

      const derived = deriveAgentKey(config.masterSecret, smartAccountAddress, keyVersion);
      res.status(200).json({
        smartAccountAddress,
        keyVersion,
        publicKeyHex: derived.publicKeyHex,
        address: derived.address,
        ed25519VerifierAddress: config.ed25519VerifierAddress,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/sign-and-submit", async (req, res, next) => {
    try {
      const body = await handleSignAndSubmit(req.body, config, store, submitPayment);
      res.status(200).json(body);
    } catch (error) {
      next(error);
    }
  });

  app.get("/transactions/:proposalId", async (req, res, next) => {
    try {
      const proposalId = String(req.params.proposalId ?? "");
      if (!UUID.test(proposalId)) {
        throw solicitudInvalida("proposalId debe ser un UUID.");
      }
      const stored = store.peek(proposalId);
      if (stored) {
        if (stored.status === "ENVIADO" && stored.txHash && lookupTransaction) {
          const resolved = applyResolution(stored, await lookupTransaction(stored.txHash));
          if (resolved !== stored) store.replace(proposalId, resolved);
          res.status(200).json(resolved);
          return;
        }
        res.status(200).json(stored);
        return;
      }
      if (store.isBusy(proposalId)) {
        res.status(200).json({
          proposalId,
          status: "ENVIADO",
          txHash: null,
          ledger: null,
          submittedAt: null,
          confirmedAt: null,
          error: null,
        });
        return;
      }
      throw noEncontrado("Esa propuesta no se recibió todavía.");
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SignerError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ code: "ERROR_INTERNO", message: "Error interno del firmante." });
  });

  return app;
}
