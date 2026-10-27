import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PointsReferenceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const POINTS_RULES_VERSION = "2026-10-27.1";

export interface AwardPointsInput {
  userId: string;
  amount: string; // decimal string, e.g. "50.00"
  referenceType: PointsReferenceType;
  referenceId: string;
  idempotencyKey: string;
}

/**
 * Append-only points ledger. `balanceCached` on the account exists purely
 * for fast display — it is reconciled from the ledger, never treated as the
 * source of truth (blueprint rule 3.3 / acceptance criterion 10).
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: a repeated call with the same idempotencyKey is a no-op that
   * returns the original entry rather than awarding twice. Must be called
   * inside the same transaction as the business event it rewards whenever
   * possible, so the award and its trigger can never diverge.
   */
  async award(input: AwardPointsInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    const account = await client.pointsAccount.findUnique({ where: { userId: input.userId } });
    if (!account) throw new NotFoundException("Points account not found.");

    const existing = await client.pointsLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    try {
      const entry = await client.pointsLedger.create({
        data: {
          accountId: account.id,
          entryType: "earn",
          amount: input.amount,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          rulesVersion: POINTS_RULES_VERSION,
        },
      });
      await client.pointsAccount.update({
        where: { id: account.id },
        data: { balanceCached: { increment: input.amount } },
      });
      return entry;
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Lost a race against a concurrent identical request — the other
        // request's row is now the canonical one.
        return client.pointsLedger.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      }
      throw err;
    }
  }

  /** Creates a compensating negative entry; never edits or deletes the original. */
  async reverse(entryId: string, idempotencyKey: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const original = await client.pointsLedger.findUnique({ where: { id: entryId } });
    if (!original) throw new NotFoundException("Ledger entry not found.");

    const existing = await client.pointsLedger.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const reversal = await client.pointsLedger.create({
      data: {
        accountId: original.accountId,
        entryType: "reversal",
        amount: new Prisma.Decimal(original.amount).negated(),
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        idempotencyKey,
        rulesVersion: POINTS_RULES_VERSION,
        reversesEntryId: original.id,
      },
    });
    await client.pointsAccount.update({
      where: { id: original.accountId },
      data: { balanceCached: { decrement: original.amount } },
    });
    return reversal;
  }

  async reconcileBalance(userId: string): Promise<Prisma.Decimal> {
    const account = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    if (!account) throw new NotFoundException("Points account not found.");
    const result = await this.prisma.pointsLedger.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  async history(userId: string) {
    const account = await this.prisma.pointsAccount.findUnique({ where: { userId } });
    if (!account) throw new NotFoundException("Points account not found.");
    const [entries, balance] = await Promise.all([
      this.prisma.pointsLedger.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: "desc" },
      }),
      this.reconcileBalance(userId),
    ]);
    return { balance, entries };
  }
}
