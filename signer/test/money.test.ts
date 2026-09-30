import { describe, expect, it } from "vitest";
import { unitsFromAmount } from "../src/money.js";
import { SignerError } from "../src/errors.js";
import { assertAmountMatchesUnits } from "../src/money.js";

describe("amount × 10^7", () => {
  it("15.0000000 → 150000000", () => {
    expect(unitsFromAmount("15.0000000")).toBe(150000000n);
    expect(unitsFromAmount("15")).toBe(150000000n);
    expect(unitsFromAmount("15.5")).toBe(155000000n);
    expect(unitsFromAmount("0.0000001")).toBe(1n);
  });

  it("falla si amountUnits no calza", () => {
    expect(() => assertAmountMatchesUnits("15.0000000", "1")).toThrow(SignerError);
  });
});
