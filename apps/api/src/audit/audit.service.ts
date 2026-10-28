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

/**
 * Append-only, hash-chained audit log. Each event's payloadHash covers its
 * own payload plus the previous event's hash, so altering or deleting a
 * past row breaks the chain for every row after it — tamper-evidence without
 * needing the blockchain anchor to be live. Corrections must be new events
 * (e.g. "assignment.award_reversed"), never edits to history.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Call this INSIDE the same Prisma transaction as the state change it records. */
  async record(input: RecordAuditEventInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    const last = await client.auditEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { payloadHash: true },
    });
    const previousHash = last?.payloadHash ?? null;

    const canonicalPayload = JSON.stringify(input.payload, Object.keys(input.payload).sort());
    const payloadHash = createHash("sha256")
      .update(`${previousHash ?? ""}:${input.eventType}:${input.entityType}:${input.entityId}:${canonicalPayload}`)
      .digest("hex");

    return client.auditEvent.create({
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

  /** Events covered by one anchor — metadata only, never the raw payload (may hold free-text notes). */
  async listForAnchor(chainAnchorId: string) {
    return this.prisma.auditEvent.findMany({
      where: { chainAnchorId },
      select: { id: true, eventType: true, entityType: true, entityId: true, payloadHash: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Verifies the hash chain for a contiguous slice of events (by id order).
   * Returns false the moment a row's stored hash doesn't match what its own
   * content + predecessor would produce — i.e. tampering or corruption.
   */
  verifyChain(events: { eventType: string; entityType: string; entityId: string; payload: unknown; previousHash: string | null; payloadHash: string }[]): boolean {
    for (const event of events) {
      const canonicalPayload = JSON.stringify(
        event.payload,
        Object.keys(event.payload as Record<string, unknown>).sort(),
      );
      const expected = createHash("sha256")
        .update(`${event.previousHash ?? ""}:${event.eventType}:${event.entityType}:${event.entityId}:${canonicalPayload}`)
        .digest("hex");
      if (expected !== event.payloadHash) return false;
    }
    return true;
  }
}
