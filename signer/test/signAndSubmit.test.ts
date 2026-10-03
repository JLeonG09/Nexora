import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ContractError } from "smart-account-kit";
import { testConfig } from "./helpers.js";
import {
  ACCOUNT_A,
  ACCOUNT_A_V1_HEX,
  PROPOSAL_ID,
  TEST_DESTINATION,
  TEST_SERVICE_KEY,
  TEST_USDC,
} from "./vectors.js";
import type { SubmitPayment } from "../src/types.js";

function body(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: PROPOSAL_ID,
    smartAccountAddress: ACCOUNT_A,
    contextRuleId: 1,
    keyVersion: 1,
    agentPublicKeyHex: ACCOUNT_A_V1_HEX,
    destinationAddress: TEST_DESTINATION,
    amount: "15.0000000",
    amountUnits: "150000000",
    assetContractId: TEST_USDC,
    memo: "logo",
    ...overrides,
  };
}

const confirmed: Awaited<ReturnType<SubmitPayment>> = {
  status: "CONFIRMADO",
  txHash: "7786da27fb36b3091c92994a911234ac09f2a4b2e77b2839c0e9fbed99bca446",
  ledger: 1234600,
  submittedAt: "2026-09-28T16:15:02Z",
  confirmedAt: "2026-09-28T16:15:06Z",
  error: null,
};

describe("POST /sign-and-submit", () => {
  it("confirma un pago y GET lo devuelve igual", async () => {
    let calls = 0;
    const app = createApp(testConfig, {
      submitPayment: async () => {
        calls += 1;
        return confirmed;
      },
    });

    const first = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body());

    expect(first.status).toBe(200);
    expect(first.body.status).toBe("CONFIRMADO");
    expect(first.body.proposalId).toBe(PROPOSAL_ID);
    expect(first.body.txHash).toBe(confirmed.txHash);
    expect(first.body.error).toBeNull();

    const again = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body());
    expect(again.status).toBe(200);
    expect(again.body.txHash).toBe(confirmed.txHash);
    expect(calls).toBe(1);

    const got = await request(app)
      .get(`/transactions/${PROPOSAL_ID}`)
      .set("X-Service-Key", TEST_SERVICE_KEY);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(first.body);
  });

  it("rechaza LLAVE_NO_COINCIDE sin firmar", async () => {
    let calls = 0;
    const app = createApp(testConfig, {
      submitPayment: async () => {
        calls += 1;
        return confirmed;
      },
    });

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body({ agentPublicKeyHex: "ab".repeat(32) }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("LLAVE_NO_COINCIDE");
    expect(calls).toBe(0);
  });

  it("rechaza amountUnits que no coincide", async () => {
    const app = createApp(testConfig, { submitPayment: async () => confirmed });
    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body({ amountUnits: "1" }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SOLICITUD_INVALIDA");
  });

  it("devuelve FALLIDO SpendingLimitExceeded en 200", async () => {
    const app = createApp(testConfig, {
      submitPayment: async () => ({
        status: "FALLIDO",
        txHash: null,
        ledger: null,
        submittedAt: null,
        confirmedAt: null,
        error: {
          code: "SpendingLimitExceeded",
          contractCode: 3221,
          stage: "SIMULACION",
          message: "La red rechazó el pago: supera el tope de gasto del mandato.",
          raw: new ContractError(3221, "SpendingLimitExceeded", "SpendingLimit", "x").message,
        },
      }),
    });

    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body({ amount: "60.0000000", amountUnits: "600000000" }));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("FALLIDO");
    expect(response.body.error.code).toBe("SpendingLimitExceeded");
    expect(response.body.error.contractCode).toBe(3221);
  });

  it("409 EN_PROCESO si la misma proposalId está en curso", async () => {
    let entered!: () => void;
    let release!: () => void;
    const enteredGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = createApp(testConfig, {
      submitPayment: async () => {
        entered();
        await releaseGate;
        return confirmed;
      },
    });

    const first = request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body());

    const waiter = (async () => {
      await enteredGate;
      const conflict = await request(app)
        .post("/sign-and-submit")
        .set("X-Service-Key", TEST_SERVICE_KEY)
        .send(body());
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe("EN_PROCESO");
      release();
    })();

    const [done] = await Promise.all([first, waiter]);
    expect(done.status).toBe(200);
  });

  it("503 si no hay quién envíe a Stellar", async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body());
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("RPC_NO_DISPONIBLE");
  });

  it("GET 404 si nunca recibió esa propuesta", async () => {
    const app = createApp(testConfig, { submitPayment: async () => confirmed });
    const response = await request(app)
      .get(`/transactions/${PROPOSAL_ID}`)
      .set("X-Service-Key", TEST_SERVICE_KEY);
    expect(response.status).toBe(404);
  });

  it("un ENVIADO con hash queda CONFIRMADO al consultar getTransaction", async () => {
    const hash = "ab".repeat(32);
    const app = createApp(testConfig, {
      submitPayment: async () => ({
        status: "ENVIADO",
        txHash: hash,
        ledger: null,
        submittedAt: "2026-10-03T18:00:00Z",
        confirmedAt: null,
        error: {
          code: "TIMEOUT_CONFIRMACION",
          contractCode: null,
          stage: "CONFIRMACION",
          message: "La red no confirmó a tiempo.",
          raw: "timeout",
        },
      }),
      lookupTransaction: async () => "CONFIRMADO",
    });

    const sent = await request(app)
      .post("/sign-and-submit")
      .set("X-Service-Key", TEST_SERVICE_KEY)
      .send(body());
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("ENVIADO");
    expect(sent.body.txHash).toBe(hash);

    const got = await request(app)
      .get(`/transactions/${PROPOSAL_ID}`)
      .set("X-Service-Key", TEST_SERVICE_KEY);
    expect(got.status).toBe(200);
    expect(got.body.status).toBe("CONFIRMADO");
    expect(got.body.txHash).toBe(hash);
    expect(got.body.error).toBeNull();
  });
});
