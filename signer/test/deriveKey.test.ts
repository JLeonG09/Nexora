import { describe, expect, it } from "vitest";
import { decodeMasterSecret } from "../src/config.js";
import { deriveAgentKey } from "../src/deriveKey.js";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  TEST_MASTER_SECRET,
  TEST_MASTER_SECRET_B64,
} from "./vectors.js";

describe("deriveAgentKey", () => {
  it("cuenta A versión 1 es estable", () => {
    const key = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 1);
    expect(key.publicKeyHex).toBe("a145adc206bdf8237d2c825814d0d50208ab2397a151c1b768d37d14386d0150");
    expect(key.address).toBe("GCQULLOCA267QI35FSBFQFGQ2UBARKZDS6QVDQNXNDJX2FBYNUAVAVPU");
  });

  it("la misma entrada dos veces da la misma llave", () => {
    const first = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 1);
    const second = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 1);
    expect(first.publicKeyHex).toBe(second.publicKeyHex);
    expect(first.address).toBe(second.address);
  });

  it("cambiar la versión cambia la llave", () => {
    const v1 = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 1);
    const v2 = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 2);
    expect(v2.publicKeyHex).toBe("a802c4bf0043303f4f4ba644e433bfed862cc332ff401a1def5ba6a16fce78e4");
    expect(v2.address).toBe("GCUAFRF7ABBTAP2PJOTEJZBTX7WYMLGDGL7UAGQ555N2NILPZZ4OJAXE");
    expect(v2.publicKeyHex).not.toBe(v1.publicKeyHex);
  });

  it("cambiar la cuenta cambia la llave", () => {
    const a = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_A, 1);
    const b = deriveAgentKey(TEST_MASTER_SECRET, ACCOUNT_B, 1);
    expect(b.publicKeyHex).toBe("169099f9ff087c12bfa23b175eef66543cdf25e013452694718b95570b503260");
    expect(b.address).toBe("GALJBGPZ74EHYEV7UI5ROXXPMZKDZXZF4AJUKJUUOGFZKVYLKAZGBTPI");
    expect(b.publicKeyHex).not.toBe(a.publicKeyHex);
  });

  it("el secreto de prueba en base64 decodifica a 32 bytes", () => {
    const decoded = decodeMasterSecret(TEST_MASTER_SECRET_B64);
    expect(decoded.equals(TEST_MASTER_SECRET)).toBe(true);
    expect(decoded.length).toBe(32);
  });
});
