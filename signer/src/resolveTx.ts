import { rpc } from "@stellar/stellar-sdk";
import type { SignResponseBody } from "./types.js";

export type TxResolution = "CONFIRMADO" | "FALLIDO" | "ENVIADO";

/** Consulta el estado final de un hash ya enviado. Un fallo de red se queda en ENVIADO. */
export type LookupTransaction = (txHash: string) => Promise<TxResolution>;

export function stellarLookup(rpcUrl: string): LookupTransaction {
  const server = new rpc.Server(rpcUrl);
  return async (txHash) => {
    try {
      const got = await server.getTransaction(txHash);
      if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) return "CONFIRMADO";
      if (got.status === rpc.Api.GetTransactionStatus.FAILED) return "FALLIDO";
      return "ENVIADO";
    } catch {
      return "ENVIADO";
    }
  };
}

export function applyResolution(stored: SignResponseBody, status: TxResolution): SignResponseBody {
  if (status === "ENVIADO" || status === stored.status) return stored;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  if (status === "CONFIRMADO") {
    return { ...stored, status, confirmedAt: stored.confirmedAt ?? now, error: null };
  }
  return {
    ...stored,
    status: "FALLIDO",
    confirmedAt: null,
    error: stored.error ?? {
      code: "TIMEOUT_CONFIRMACION",
      contractCode: null,
      stage: "CONFIRMACION",
      message: "La red no confirmó la transacción.",
      raw: stored.txHash ?? "",
    },
  };
}
