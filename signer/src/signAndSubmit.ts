import { deriveAgentKey } from "./deriveKey.js";
import { enProceso, llaveNoCoincide, rpcNoDisponible } from "./errors.js";
import { parseSignRequest } from "./parseRequest.js";
import type { ProposalStore } from "./store.js";
import type { AppConfig } from "./config.js";
import type { SignResponseBody, SubmitPayment } from "./types.js";

export async function handleSignAndSubmit(
  body: unknown,
  config: AppConfig,
  store: ProposalStore,
  submitPayment: SubmitPayment | undefined,
): Promise<SignResponseBody> {
  const parsed = parseSignRequest(body, config.usdcContractId);
  const derived = deriveAgentKey(config.masterSecret, parsed.smartAccountAddress, parsed.keyVersion);
  if (derived.publicKeyHex.toLowerCase() !== parsed.agentPublicKeyHex) {
    throw llaveNoCoincide();
  }

  const cached = store.peek(parsed.proposalId);
  if (cached) {
    return cached;
  }

  const slot = store.begin(parsed.proposalId);
  if (slot === "exists") {
    return store.peek(parsed.proposalId)!;
  }
  if (slot === "busy") {
    throw enProceso();
  }

  if (!submitPayment) {
    store.abort(parsed.proposalId);
    throw rpcNoDisponible("El firmante no tiene quién envíe a Stellar (falta FEE_PAYER_SECRET).");
  }

  try {
    console.log(
      `sign-and-submit proposalId=${parsed.proposalId} account=${parsed.smartAccountAddress} amount=${parsed.amount} memo=${parsed.memo}`,
    );
    const outcome = await submitPayment({
      smartAccountAddress: parsed.smartAccountAddress,
      contextRuleId: parsed.contextRuleId,
      destinationAddress: parsed.destinationAddress,
      amount: parsed.amount,
      assetContractId: parsed.assetContractId,
      memo: parsed.memo,
      agentSecret: derived.keypair.secret(),
    });
    const response: SignResponseBody = { proposalId: parsed.proposalId, ...outcome };
    store.finish(parsed.proposalId, response);
    return response;
  } catch (error) {
    store.abort(parsed.proposalId);
    throw error;
  }
}
