import { AuditService } from "./audit.service";
import { createHash } from "crypto";

describe("AuditService.verifyChain", () => {
  const service = new AuditService({} as any);

  function hashOf(event: {
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    previousHash: string | null;
  }) {
    const canonical = (value: any): any => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
      }
      return value;
    };
    const canonicalPayload = JSON.stringify(canonical(event.payload));
    return createHash("sha256")
      .update(`${event.previousHash ?? ""}:${event.eventType}:${event.entityType}:${event.entityId}:${canonicalPayload}`)
      .digest("hex");
  }

  it("validates a correctly chained sequence", () => {
    const e1 = { eventType: "a", entityType: "assignment", entityId: "1", payload: { x: 1 }, previousHash: null };
    const h1 = hashOf(e1);
    const e2 = { eventType: "b", entityType: "assignment", entityId: "1", payload: { x: 2 }, previousHash: h1 };
    const h2 = hashOf(e2);
    expect(service.verifyChain([{ ...e1, payloadHash: h1 }, { ...e2, payloadHash: h2 }])).toBe(true);
  });

  it("canonicalizes nested object keys independent of insertion order", () => {
    const first = {
      eventType: "nested",
      entityType: "assignment",
      entityId: "1",
      payload: { z: [{ b: 2, a: 1 }], a: { y: 2, x: 1 } },
      previousHash: null,
    };
    const second = {
      ...first,
      payload: { a: { x: 1, y: 2 }, z: [{ a: 1, b: 2 }] },
    };
    expect(hashOf(first)).toBe(hashOf(second));
    expect(service.verifyChain([{ ...first, payloadHash: hashOf(second) }])).toBe(true);
  });

  it("detects changes to nested payload fields", () => {
    const event = {
      eventType: "nested",
      entityType: "assignment",
      entityId: "1",
      payload: { evidence: { contentHash: "original" } },
      previousHash: null,
    };
    const altered = { ...event, payload: { evidence: { contentHash: "tampered" } } };
    expect(service.verifyChain([{ ...altered, payloadHash: hashOf(event) }])).toBe(false);
  });

  it("continues to validate legacy shallow-canonicalized flat payload records", () => {
    const event = { eventType: "legacy", entityType: "assignment", entityId: "1", payload: { x: 1 }, previousHash: null };
    const legacyPayload = JSON.stringify(event.payload, Object.keys(event.payload).sort());
    const legacyHash = createHash("sha256")
      .update(`${event.previousHash ?? ""}:${event.eventType}:${event.entityType}:${event.entityId}:${legacyPayload}`)
      .digest("hex");
    expect(service.verifyChain([{ ...event, payloadHash: legacyHash }])).toBe(true);
  });

  it("detects a tampered payload in the middle of the chain", () => {
    const e1 = { eventType: "a", entityType: "assignment", entityId: "1", payload: { x: 1 }, previousHash: null };
    const h1 = hashOf(e1);
    const e2 = { eventType: "b", entityType: "assignment", entityId: "1", payload: { x: 2 }, previousHash: h1 };
    const h2 = hashOf(e2);
    const chain = [
      { ...e1, payload: { x: 999 }, payloadHash: h1 },
      { ...e2, payloadHash: h2 },
    ];
    expect(service.verifyChain(chain)).toBe(false);
  });
});
