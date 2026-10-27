import { createHash } from "crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// @noble/ed25519 v2 needs the sha512 implementation wired in explicitly.
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));

export interface CredentialPayload {
  credentialId: string;
  subjectId: string;
  issuerOrgId: string;
  credentialType: string;
  issuedAt: string; // ISO 8601
  expiresAt: string | null;
}

/**
 * Canonical JSON (sorted keys) → sha256 hex. This is what gets signed and
 * what a verifier recomputes — never sign the raw object directly, since
 * key order in JSON.stringify is not guaranteed stable across engines.
 */
export function canonicalPayloadHash(payload: CredentialPayload): string {
  const sortedKeys = Object.keys(payload).sort() as (keyof CredentialPayload)[];
  const canonical = JSON.stringify(payload, sortedKeys);
  return createHash("sha256").update(canonical).digest("hex");
}

export async function signPayloadHash(payloadHash: string, privateKeyHex: string): Promise<string> {
  const signature = await ed.signAsync(Buffer.from(payloadHash, "hex"), Buffer.from(privateKeyHex, "hex"));
  return Buffer.from(signature).toString("hex");
}

export async function verifySignature(
  payloadHash: string,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(
      Buffer.from(signatureHex, "hex"),
      Buffer.from(payloadHash, "hex"),
      Buffer.from(publicKeyHex, "hex"),
    );
  } catch {
    return false;
  }
}
