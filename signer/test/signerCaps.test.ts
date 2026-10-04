import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createFileProposalStore, createProposalStore } from "../src/store.js";
import type { SubmitPayment } from "../src/types.js";
import { testConfig } from "./helpers.js";
import {
  ACCOUNT_A,
  ACCOUNT_A_V1_HEX,
  TEST_DESTINATION,
  TEST_SERVICE_KEY,
  TEST_USDC,
} from "./vectors.js";

const TX_HASH = "7786da27fb36b3091c92994a911234ac09f2a4b2e77b2839c0e9fbed99bca446";

const confirmed: Awaited<ReturnType<SubmitPayment>> = {
  status: "CONFIRMADO",
  txHash: TX_HASH,
  ledger: 1234600,
  submittedAt: "2026-09-28T16:15:02Z",
  confirmedAt: "2026-09-28T16:15:06Z",
  error: null,
};

function body(proposalId: string, amount: string, amountUnits: string) {
  return {
    proposalId,
    smartAccountAddress: ACCOUNT_A,
    contextRuleId: 1,
    keyVersion: 1,
    agentPublicKeyHex: ACCOUNT_A_V1_HEX,
    destinationAddress: TEST_DESTINATION,
    amount,
    amountUnits,
    assetContractId: TEST_USDC,
    memo: "logo",
    dailyLimitUnits: "500000000",
  };
}

function configWith(caps: Pick<AppConfig, "maxAmountPerTx" | "maxAmountPerPeriod" | "periodHours">): AppConfig {
  return { ...testConfig, ...caps };
}

const hour = 60 * 60 * 1000;

describe("tope propio del firmante", () => {
  it("deja pasar un monto dentro del tope por transacción y del período", async () => {
    let calls = 0;
    const app = createApp(
      configWith({ maxAmountPerTx: 1_000_000_000n, maxAmountPerPeriod: 5_000_000_000n, periodHours: 24 }),
      {
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c01", "15.0000000", "150000000"));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CONFIRMADO");
    expect(calls).toBe(1);
  });

  it("rechaza un monto mayor al tope por transacción sin firmar", async () => {
    let calls = 0;
    const app = createApp(
      configWith({ maxAmountPerTx: 1_000_000_000n, maxAmountPerPeriod: 5_000_000_000n, periodHours: 24 }),
      {
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c02", "150.0000000", "1500000000"));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("TOPE_FIRMANTE_TX");
    expect(calls).toBe(0);
  });

  it("rechaza cuando el acumulado del período supera el tope", async () => {
    let calls = 0;
    const app = createApp(
      configWith({ maxAmountPerTx: 1_000_000_000n, maxAmountPerPeriod: 2_000_000_000n, periodHours: 24 }),
      {
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );

    for (const id of ["9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c11", "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c12"]) {
      const ok = await request(app)
        .post("/sign-and-submit")
        .set("X-Service-Key", TEST_SERVICE_KEY)
        .send(body(id, "80.0000000", "800000000"));
      expect(ok.status).toBe(200);
    }

    const third = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c13", "80.0000000", "800000000"));

    expect(third.status).toBe(422);
    expect(third.body.code).toBe("TOPE_FIRMANTE_PERIODO");
    expect(calls).toBe(2);
  });

  it("no cuenta dos veces el mismo proposalId", async () => {
    let calls = 0;
    const app = createApp(
      configWith({ maxAmountPerTx: 1_000_000_000n, maxAmountPerPeriod: 2_000_000_000n, periodHours: 24 }),
      {
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );
    const firstId = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c21";

    const first = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body(firstId, "80.0000000", "800000000"));
    const replay = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body(firstId, "80.0000000", "800000000"));
    const another = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c22", "80.0000000", "800000000"));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.txHash).toBe(TX_HASH);
    expect(another.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("no suma un gasto firmado fuera de la ventana del período", async () => {
    const store = createProposalStore();
    const oldId = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c31";
    store.finish(
      oldId,
      {
        proposalId: oldId,
        status: "CONFIRMADO",
        txHash: TX_HASH,
        ledger: 1,
        submittedAt: "2026-09-26T16:15:02Z",
        confirmedAt: "2026-09-26T16:15:06Z",
        error: null,
      },
      {
        smartAccountAddress: ACCOUNT_A,
        amountUnits: "4000000000",
        recordedAt: new Date(Date.now() - 48 * hour).toISOString(),
      },
    );
    const app = createApp(
      configWith({ maxAmountPerTx: 5_000_000_000n, maxAmountPerPeriod: 5_000_000_000n, periodHours: 24 }),
      {
        store,
        submitPayment: async () => confirmed,
      },
    );

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c32", "200.0000000", "2000000000"));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CONFIRMADO");
  });

  it("sí suma un gasto reciente de la misma cuenta", async () => {
    const store = createProposalStore();
    const recentId = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c41";
    store.finish(
      recentId,
      {
        proposalId: recentId,
        status: "CONFIRMADO",
        txHash: TX_HASH,
        ledger: 1,
        submittedAt: "2026-10-03T16:15:02Z",
        confirmedAt: "2026-10-03T16:15:06Z",
        error: null,
      },
      {
        smartAccountAddress: ACCOUNT_A,
        amountUnits: "4000000000",
        recordedAt: new Date().toISOString(),
      },
    );
    let calls = 0;
    const app = createApp(
      configWith({ maxAmountPerTx: 5_000_000_000n, maxAmountPerPeriod: 5_000_000_000n, periodHours: 24 }),
      {
        store,
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c42", "200.0000000", "2000000000"));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("TOPE_FIRMANTE_PERIODO");
    expect(calls).toBe(0);
  });

  it("conserva el acumulado al reabrir proposals.json y no deja el archivo temporal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nexora-signer-"));
    const file = join(dir, "proposals.json");
    const store = createFileProposalStore(file);
    const app = createApp(
      configWith({ maxAmountPerTx: 2_000_000_000n, maxAmountPerPeriod: 2_000_000_000n, periodHours: 24 }),
      {
        store,
        submitPayment: async () => confirmed,
      },
    );

    const first = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c51", "80.0000000", "800000000"));
    expect(first.status).toBe(200);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    const saved = JSON.parse(readFileSync(file, "utf8")) as Array<{ amountUnits?: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.amountUnits).toBe("800000000");

    let calls = 0;
    const reopened = createApp(
      configWith({ maxAmountPerTx: 2_000_000_000n, maxAmountPerPeriod: 2_000_000_000n, periodHours: 24 }),
      {
        store: createFileProposalStore(file),
        submitPayment: async () => {
          calls += 1;
          return confirmed;
        },
      },
    );
    const second = await request(reopened)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body("9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c52", "150.0000000", "1500000000"));

    expect(second.status).toBe(422);
    expect(second.body.code).toBe("TOPE_FIRMANTE_PERIODO");
    expect(calls).toBe(0);
  });
});
