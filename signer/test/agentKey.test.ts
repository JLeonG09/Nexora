import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { testConfig } from "./helpers.js";
import { ACCOUNT_A, TEST_SERVICE_KEY, TEST_VERIFIER } from "./vectors.js";

const app = createApp(testConfig);

describe("GET /agent-key", () => {
  it("responde la pública de la cuenta y versión", async () => {
    const response = await request(app)
      .get("/agent-key")
      .query({ smartAccountAddress: ACCOUNT_A, keyVersion: 1 })
      .set("X-Service-Key", TEST_SERVICE_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      smartAccountAddress: ACCOUNT_A,
      keyVersion: 1,
      publicKeyHex: "a145adc206bdf8237d2c825814d0d50208ab2397a151c1b768d37d14386d0150",
      address: "GCQULLOCA267QI35FSBFQFGQ2UBARKZDS6QVDQNXNDJX2FBYNUAVAVPU",
      ed25519VerifierAddress: TEST_VERIFIER,
    });
  });

  it("rechaza sin clave de servicio", async () => {
    const response = await request(app)
      .get("/agent-key")
      .query({ smartAccountAddress: ACCOUNT_A, keyVersion: 1 });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("CLAVE_SERVICIO_INVALIDA");
  });

  it("rechaza una dirección inválida", async () => {
    const response = await request(app)
      .get("/agent-key")
      .query({ smartAccountAddress: "GANA", keyVersion: 1 })
      .set("X-Service-Key", TEST_SERVICE_KEY);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SOLICITUD_INVALIDA");
  });

  it("rechaza keyVersion menor a 1", async () => {
    const response = await request(app)
      .get("/agent-key")
      .query({ smartAccountAddress: ACCOUNT_A, keyVersion: 0 })
      .set("X-Service-Key", TEST_SERVICE_KEY);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SOLICITUD_INVALIDA");
  });
});
