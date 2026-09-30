import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SignResponseBody } from "./types.js";

export type ProposalStore = {
  peek(proposalId: string): SignResponseBody | undefined;
  isBusy(proposalId: string): boolean;
  begin(proposalId: string): "exists" | "busy" | "ok";
  finish(proposalId: string, body: SignResponseBody): void;
  abort(proposalId: string): void;
  replace(proposalId: string, body: SignResponseBody): void;
};

export function createProposalStore(): ProposalStore {
  const results = new Map<string, SignResponseBody>();
  const inflight = new Set<string>();

  return {
    peek(proposalId) {
      return results.get(proposalId);
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
    finish(proposalId, body) {
      results.set(proposalId, body);
      inflight.delete(proposalId);
    },
    abort(proposalId) {
      inflight.delete(proposalId);
    },
    replace(proposalId, body) {
      results.set(proposalId, body);
    },
  };
}

/** Guarda el resultado en disco para que un reinicio no vuelva a pagar el mismo proposalId. */
export function createFileProposalStore(filePath: string): ProposalStore {
  const memory = createProposalStore();
  const saved = new Map<string, SignResponseBody>();

  if (existsSync(filePath)) {
    const list = JSON.parse(readFileSync(filePath, "utf8")) as SignResponseBody[];
    for (const body of list) {
      saved.set(body.proposalId, body);
      memory.finish(body.proposalId, body);
    }
  }

  const persist = (): void => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify([...saved.values()], null, 2));
  };

  return {
    peek: (proposalId) => memory.peek(proposalId),
    isBusy: (proposalId) => memory.isBusy(proposalId),
    begin: (proposalId) => memory.begin(proposalId),
    abort: (proposalId) => memory.abort(proposalId),
    finish(proposalId, body) {
      memory.finish(proposalId, body);
      saved.set(proposalId, body);
      persist();
    },
    replace(proposalId, body) {
      memory.replace(proposalId, body);
      saved.set(proposalId, body);
      persist();
    },
  };
}
