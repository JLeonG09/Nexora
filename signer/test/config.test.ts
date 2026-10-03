import { describe, expect, it } from "vitest";
import { isWeakServiceKey, loadConfig } from "../src/config.js";
import { TEST_MASTER_SECRET_B64, TEST_USDC, TEST_VERIFIER, TEST_WASM } from "./vectors.js";

const STRONG = "0123456789abcdef0123456789abcdef";

function envWith(serviceKey: string | undefined): NodeJS.ProcessEnv {
  return {
    SIGNER_SERVICE_KEY: serviceKey,
    AGENT_MASTER_SECRET: TEST_MASTER_SECRET_B64,
    ED25519_VERIFIER_ADDRESS: TEST_VERIFIER,
    WEBAUTHN_VERIFIER_ADDRESS: TEST_VERIFIER,
    USDC_CONTRACT_ID: TEST_USDC,
    ACCOUNT_WASM_HASH: TEST_WASM,
  };
}

describe("SIGNER_SERVICE_KEY", () => {
  it("rechaza una clave corta o de la denylist", () => {
    expect(isWeakServiceKey("1234")).toBe(true);
    expect(isWeakServiceKey("cambia-esto")).toBe(true);
    expect(isWeakServiceKey("changeme")).toBe(true);
    expect(isWeakServiceKey("cambia-esto-" + "a".repeat(20))).toBe(true);
    expect(() => loadConfig(envWith("1234"))).toThrow(/SIGNER_SERVICE_KEY/);
    expect(() => loadConfig(envWith("changeme"))).toThrow(/SIGNER_SERVICE_KEY/);
    expect(() => loadConfig(envWith(undefined))).toThrow(/SIGNER_SERVICE_KEY/);
  });

  it("acepta una clave de 32 caracteres que no es un ejemplo", () => {
    expect(isWeakServiceKey(STRONG)).toBe(false);
    expect(loadConfig(envWith(STRONG)).serviceKey).toBe(STRONG);
  });
});
