import { describe, expect, it } from "vitest";
import { ContractError } from "smart-account-kit";
import { mapUnknownToSignError } from "../src/mapSubmitError.js";

describe("mapUnknownToSignError", () => {
  it("lee SpendingLimitExceeded desde el texto del RPC", () => {
    const mapped = mapUnknownToSignError(
      new Error("HostError: Error(Contract, #3221)"),
      "SIMULACION",
    );
    expect(mapped.code).toBe("SpendingLimitExceeded");
    expect(mapped.contractCode).toBe(3221);
    expect(mapped.stage).toBe("SIMULACION");
    expect(mapped.message).toContain("tope de gasto");
    expect(mapped.raw).toContain("#3221");
  });

  it("si no hay saldo, no lo confunde con el tope", () => {
    const mapped = mapUnknownToSignError(
      new Error('HostError: Error(Contract, #10) "balance is not sufficient to spend"'),
      "SIMULACION",
    );
    expect(mapped.code).toBe("SIMULACION_FALLIDA");
    expect(mapped.message).toContain("saldo");
  });

  it("traduce ContextRuleNotFound a regla inexistente", () => {
    const mapped = mapUnknownToSignError(
      new ContractError(3000, "ContextRuleNotFound", "SmartAccount", "missing"),
      "SIMULACION",
    );
    expect(mapped.code).toBe("REGLA_EXPIRADA_O_INEXISTENTE");
    expect(mapped.contractCode).toBe(3000);
  });
});
