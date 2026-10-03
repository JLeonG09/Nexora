import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SignResponseBody } from "./types.js";

export type SpendMeta = {
  smartAccountAddress: string;
  amountUnits: string;
  recordedAt: string;
};

export type ProposalStore = {
  peek(proposalId: string): SignResponseBody | undefined;
  isBusy(proposalId: string): boolean;
  begin(proposalId: string): "exists" | "busy" | "ok";
  finish(proposalId: string, body: SignResponseBody, spend?: SpendMeta): void;
  abort(proposalId: string): void;
  replace(proposalId: string, body: SignResponseBody): void;
  /** Reserva el monto mientras se firma, para que dos pedidos a la vez no se salten el tope. */
  reserve(proposalId: string, spend: SpendMeta): void;
  release(proposalId: string): void;
  /** Suma lo firmado y enviado de esa cuenta con recordedAt >= sinceMs, más lo reservado. */
  spentUnits(smartAccountAddress: string, sinceMs: number): bigint;
  rows(): StoredProposal[];
};

export type StoredProposal = SignResponseBody & Partial<SpendMeta>;

type Tracked = {
  body: SignResponseBody;
  spend?: SpendMeta;
  counts: boolean;
};

function countsTowardCap(body: SignResponseBody): boolean {
  if (body.status === "CONFIRMADO" || body.status === "ENVIADO") {
    return true;
  }
  return body.status === "FALLIDO" && body.txHash != null;
}

function publicBody(row: StoredProposal): SignResponseBody {
  return {
    proposalId: row.proposalId,
    status: row.status,
    txHash: row.txHash,
    ledger: row.ledger,
    submittedAt: row.submittedAt,
    confirmedAt: row.confirmedAt,
    error: row.error,
  };
}

function toStored(row: Tracked): StoredProposal {
  if (!row.spend) {
    return row.body;
  }
  return { ...row.body, ...row.spend };
}

export function createProposalStore(): ProposalStore {
  const results = new Map<string, Tracked>();
  const inflight = new Set<string>();
  const reserved = new Map<string, SpendMeta>();

  const spentUnits = (smartAccountAddress: string, sinceMs: number): bigint => {
    let total = 0n;
    const counted = new Set<string>();
    for (const [proposalId, row] of results) {
      if (!row.counts || !row.spend) {
        continue;
      }
      if (row.spend.smartAccountAddress !== smartAccountAddress) {
        continue;
      }
      const at = Date.parse(row.spend.recordedAt);
      if (Number.isNaN(at) || at < sinceMs) {
        continue;
      }
      total += BigInt(row.spend.amountUnits);
      counted.add(proposalId);
    }
    for (const [proposalId, spend] of reserved) {
      if (counted.has(proposalId) || spend.smartAccountAddress !== smartAccountAddress) {
        continue;
      }
      const at = Date.parse(spend.recordedAt);
      if (Number.isNaN(at) || at < sinceMs) {
        continue;
      }
      total += BigInt(spend.amountUnits);
    }
    return total;
  };

  return {
    peek(proposalId) {
      return results.get(proposalId)?.body;
    },
    isBusy(proposalId) {
      return inflight.has(proposalId);
    },
    begin(proposalId) {
      if (results.has(proposalId)) {
        return "exists";
      }
      if (inflight.has(proposalId)) {
        return "busy";
      }
      inflight.add(proposalId);
      return "ok";
    },
    finish(proposalId, body, spend) {
      results.set(
        proposalId,
        spend
          ? { body, counts: countsTowardCap(body), spend }
          : { body, counts: countsTowardCap(body) },
      );
      inflight.delete(proposalId);
      reserved.delete(proposalId);
    },
    abort(proposalId) {
      inflight.delete(proposalId);
      reserved.delete(proposalId);
    },
    replace(proposalId, body) {
      const previous = results.get(proposalId);
      results.set(
        proposalId,
        previous?.spend
          ? { body, counts: countsTowardCap(body), spend: previous.spend }
          : { body, counts: countsTowardCap(body) },
      );
    },
    reserve(proposalId, spend) {
      reserved.set(proposalId, spend);
    },
    release(proposalId) {
      reserved.delete(proposalId);
    },
    spentUnits,
    rows() {
      return [...results.values()].map(toStored);
    },
  };
}

/** Guarda el resultado en disco para que un reinicio no vuelva a pagar el mismo proposalId. */
export function createFileProposalStore(filePath: string): ProposalStore {
  const memory = createProposalStore();

  if (existsSync(filePath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo leer ${filePath}: ${detail}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`No se pudo leer ${filePath}: se esperaba una lista de propuestas.`);
    }
    for (const item of parsed) {
      if (item === null || typeof item !== "object") {
        throw new Error(`No se pudo leer ${filePath}: una entrada no es un objeto.`);
      }
      const row = item as StoredProposal;
      if (typeof row.proposalId !== "string") {
        throw new Error(`No se pudo leer ${filePath}: falta proposalId.`);
      }
      const body = publicBody(row);
      if (
        typeof row.smartAccountAddress === "string" &&
        typeof row.amountUnits === "string" &&
        typeof row.recordedAt === "string"
      ) {
        memory.finish(row.proposalId, body, {
          smartAccountAddress: row.smartAccountAddress,
          amountUnits: row.amountUnits,
          recordedAt: row.recordedAt,
        });
      } else {
        memory.finish(row.proposalId, body);
      }
    }
  }

  const persist = (): void => {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(memory.rows(), null, 2));
    renameSync(tmp, filePath);
  };

  return {
    peek: (proposalId) => memory.peek(proposalId),
    isBusy: (proposalId) => memory.isBusy(proposalId),
    begin: (proposalId) => memory.begin(proposalId),
    abort: (proposalId) => memory.abort(proposalId),
    reserve: (proposalId, spend) => memory.reserve(proposalId, spend),
    release: (proposalId) => memory.release(proposalId),
    spentUnits: (smartAccountAddress, sinceMs) => memory.spentUnits(smartAccountAddress, sinceMs),
    rows: () => memory.rows(),
    finish(proposalId, body, spend) {
      if (spend) {
        memory.finish(proposalId, body, spend);
      } else {
        memory.finish(proposalId, body);
      }
      persist();
    },
    replace(proposalId, body) {
      memory.replace(proposalId, body);
      persist();
    },
  };
}
