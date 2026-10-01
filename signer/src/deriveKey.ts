import { hkdfSync } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

export const HKDF_SALT = "riendas-agent-key-v1";

export type DerivedAgentKey = {
  keypair: Keypair;
  publicKeyHex: string;
  address: string;
};

export function deriveAgentKey(
  masterSecret: Buffer,
  smartAccountAddress: string,
  keyVersion: number,
): DerivedAgentKey {
  const seed = Buffer.from(
    hkdfSync(
      "sha256",
      masterSecret,
      HKDF_SALT,
      `${smartAccountAddress}:${keyVersion}`,
      32,
    ),
  );
  const keypair = Keypair.fromRawEd25519Seed(seed);
  return {
    keypair,
    publicKeyHex: Buffer.from(keypair.rawPublicKey()).toString("hex"),
    address: keypair.publicKey(),
  };
}
