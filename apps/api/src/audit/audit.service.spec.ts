import { AuditService } from "./audit.service";

describe("AuditService.verifyChain", () => {
  const service = new AuditService({} as any);

  function hashOf(event: { eventType: string; entityType: string; entityId: string; payload: Record<string, unknown>; previousHash: string | null }) {
    const crypto = require("crypto");
    const canonicalPayload = JSON.stringify(event.payload, Object.keys(event.payload).sort());
    return crypto
      .createHash("sha256")
      .update(`${event.previousHash ?? ""}:${event.eventType}:${event.entityType}:${event.entityId}:${canonicalPayload}`)
      .digest("hex");
  }

  it("validates a correctly chained sequence", () => {
    const e1 = { eventType: "a", entityType: "assignment", entityId: "1", payload: { x: 1 }, previousHash: null };
    const h1 = hashOf(e1);
    const e2 = { eventType: "b", entityType: "assignment", entityId: "1", payload: { x: 2 }, previousHash: h1 };
    const h2 = hashOf(e2);

    const chain = [
      { ...e1, payloadHash: h1 },
      { ...e2, payloadHash: h2 },
    ];

    expect(service.verifyChain(chain)).toBe(true);
  });

  it("detects a tampered payload in the middle of the chain", () => {
    const e1 = { eventType: "a", entityType: "assignment", entityId: "1", payload: { x: 1 }, previousHash: null };
    const h1 = hashOf(e1);
    const e2 = { eventType: "b", entityType: "assignment", entityId: "1", payload: { x: 2 }, previousHash: h1 };
    const h2 = hashOf(e2);

    const chain = [
      { ...e1, payload: { x: 999 }, payloadHash: h1 }, // tampered after hash was computed
      { ...e2, payloadHash: h2 },
    ];

    expect(service.verifyChain(chain)).toBe(false);
  });
});
