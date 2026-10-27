import * as ed from "@noble/ed25519";
import { canonicalPayloadHash, signPayloadHash, verifySignature, CredentialPayload } from "./credential-signing";

describe("credential signing", () => {
  const payload: CredentialPayload = {
    credentialId: "11111111-1111-1111-1111-111111111111",
    subjectId: "22222222-2222-2222-2222-222222222222",
    issuerOrgId: "33333333-3333-3333-3333-333333333333",
    credentialType: "stcw_basic_safety",
    issuedAt: "2026-10-27T00:00:00.000Z",
    expiresAt: null,
  };

  it("produces a stable hash regardless of key order in the input object", () => {
    const reordered: CredentialPayload = {
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt,
      credentialType: payload.credentialType,
      issuerOrgId: payload.issuerOrgId,
      subjectId: payload.subjectId,
      credentialId: payload.credentialId,
    };
    expect(canonicalPayloadHash(payload)).toBe(canonicalPayloadHash(reordered));
  });

  it("round-trips: a genuine signature verifies against the matching public key", async () => {
    const privateKey = Buffer.from(ed.utils.randomPrivateKey()).toString("hex");
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString("hex");

    const hash = canonicalPayloadHash(payload);
    const signature = await signPayloadHash(hash, privateKey);

    expect(await verifySignature(hash, signature, publicKey)).toBe(true);
  });

  it("fails verification when the payload is altered after signing", async () => {
    const privateKey = Buffer.from(ed.utils.randomPrivateKey()).toString("hex");
    const publicKey = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString("hex");

    const hash = canonicalPayloadHash(payload);
    const signature = await signPayloadHash(hash, privateKey);

    const tamperedHash = canonicalPayloadHash({ ...payload, credentialType: "stcw_advanced_firefighting" });
    expect(await verifySignature(tamperedHash, signature, publicKey)).toBe(false);
  });

  it("fails verification against the wrong public key", async () => {
    const privateKey = Buffer.from(ed.utils.randomPrivateKey()).toString("hex");
    const wrongPublicKey = Buffer.from(
      await ed.getPublicKeyAsync(Buffer.from(ed.utils.randomPrivateKey()).toString("hex")),
    ).toString("hex");

    const hash = canonicalPayloadHash(payload);
    const signature = await signPayloadHash(hash, privateKey);

    expect(await verifySignature(hash, signature, wrongPublicKey)).toBe(false);
  });
});
