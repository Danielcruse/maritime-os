import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordAuditEventInput {
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}

// A transaction-scoped PostgreSQL advisory lock serializes all audit-chain
// appends, including calls made by separate API replicas. Keep this key
// stable across deployments; it is an internal lock namespace, not a secret.
const AUDIT_CHAIN_LOCK_KEY = 6_542_847_219_031_117_001n;

function canonicalJson(value: unknown): string {
  // Round-trip first so hashing follows JSON's actual data model (toJSON,
  // undefined object properties, and array serialization), then recursively
  // sort keys at every nesting depth. The old top-level replacer missed nested
  // fields and could therefore omit meaningful evidence from a hash.
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Audit payload must be JSON serializable.");
  const parsed: unknown = JSON.parse(json);
  const sortRecursively = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortRecursively);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, sortRecursively(child)]),
      );
    }
    return item;
  };
  return JSON.stringify(sortRecursively(parsed));
}

function legacyCanonicalJson(payload: unknown): string {
  const object = payload as Record<string, unknown>;
  return JSON.stringify(payload, Object.keys(object).sort());
}

function auditHash(
  previousHash: string | null,
  eventType: string,
  entityType: string,
  entityId: string,
  canonicalPayload: string,
): string {
  return createHash("sha256")
    .update(`${previousHash ?? ""}:${eventType}:${entityType}:${entityId}:${canonicalPayload}`)
    .digest("hex");
}

/**
 * Append-only, hash-chained audit log. Appends acquire a transaction-scoped
 * advisory lock before reading the predecessor so concurrent API instances
 * cannot fork the global chain. Corrections must be new events, never edits.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Call inside the same transaction as the state change it records. */
  async record(input: RecordAuditEventInput, tx?: Prisma.TransactionClient) {
    if (tx) return this.recordInTransaction(input, tx);
    return this.prisma.$transaction((transaction) => this.recordInTransaction(input, transaction));
  }

  private async recordInTransaction(input: RecordAuditEventInput, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`;

    const last = await tx.auditEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { payloadHash: true },
    });
    const previousHash = last?.payloadHash ?? null;
    const payloadHash = auditHash(
      previousHash,
      input.eventType,
      input.entityType,
      input.entityId,
      canonicalJson(input.payload),
    );

    return tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload as Prisma.InputJsonValue,
        payloadHash,
        previousHash,
      },
    });
  }

  async history(entityType: string, entityId: string) {
    return this.prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Oldest-first, capped batch of events never folded into a chain anchor yet. */
  async findUnanchored(limit: number) {
    return this.prisma.auditEvent.findMany({
      where: { chainAnchorId: null },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async markAnchored(eventIds: string[], chainAnchorId: string) {
    await this.prisma.auditEvent.updateMany({ where: { id: { in: eventIds } }, data: { chainAnchorId } });
  }

  /** Events covered by one anchor — metadata only, never raw payload. */
  async listForAnchor(chainAnchorId: string) {
    return this.prisma.auditEvent.findMany({
      where: { chainAnchorId },
      select: { id: true, eventType: true, entityType: true, entityId: true, payloadHash: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Verifies a contiguous slice. The legacy fallback preserves validation
   * for records produced by the former shallow-key canonicalizer. New writes
   * always use recursive canonicalization.
   */
  verifyChain(events: {
    eventType: string;
    entityType: string;
    entityId: string;
    payload: unknown;
    previousHash: string | null;
    payloadHash: string;
  }[]): boolean {
    for (const event of events) {
      let expected: string;
      try {
        expected = auditHash(
          event.previousHash,
          event.eventType,
          event.entityType,
          event.entityId,
          canonicalJson(event.payload),
        );
      } catch {
        return false;
      }
      if (expected !== event.payloadHash) {
        let legacyExpected: string;
        try {
          legacyExpected = auditHash(
            event.previousHash,
            event.eventType,
            event.entityType,
            event.entityId,
            legacyCanonicalJson(event.payload),
          );
        } catch {
          return false;
        }
        if (legacyExpected !== event.payloadHash) return false;
      }
    }
    return true;
  }
}
