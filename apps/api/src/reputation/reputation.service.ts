import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { calculateReputation, ReputationMetricsInput } from "./reputation-calculator";

@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateForOrganization(organizationId: string) {
    const [organization, confirmedAssignments, cancelledCount, disputes, reviews] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.prisma.assignment.findMany({
        where: { awardedToOrgId: organizationId, status: "confirmed" },
        select: { id: true, createdAt: true, updatedAt: true, listing: { select: { expiresAt: true } } },
      }),
      this.prisma.assignment.count({ where: { awardedToOrgId: organizationId, status: "cancelled" } }),
      this.prisma.dispute.findMany({
        where: { assignment: { awardedToOrgId: organizationId } },
        select: { status: true },
      }),
      this.prisma.review.aggregate({
        where: { revieweeOrgId: organizationId, status: "active" },
        _sum: { rating: true },
        _count: { rating: true },
      }),
    ]);

    // Credentials are held by individual users, not organizations (see
    // schema), so "verified credential" here means the org's own business
    // verification is currently active — not a seafarer-style credential.
    // A richer org-level credential concept is future work.
    const hasVerifiedCredential = organization.verificationStatus === "verified";

    const onTimeCompletedCount = confirmedAssignments.filter(
      (a) => !a.listing.expiresAt || a.updatedAt <= a.listing.expiresAt,
    ).length;

    const input: ReputationMetricsInput = {
      confirmedCompletedCount: confirmedAssignments.length,
      onTimeCompletedCount,
      cancelledCount,
      disputesOpenedAgainst: disputes.length,
      disputesUpheldAgainst: disputes.filter((d) => d.status === "resolved_for_opener").length,
      ratingsSum: reviews._sum.rating ?? 0,
      ratingsCount: reviews._count.rating ?? 0,
      hasVerifiedCredential,
    };

    const result = calculateReputation(input);

    return this.prisma.reputationSnapshot.create({
      data: {
        subjectId: organizationId,
        scoreVersion: result.scoreVersion,
        score: result.score,
        sampleSize: result.sampleSize,
        metrics: result.metrics as any,
      },
    });
  }

  async latestForOrganization(organizationId: string) {
    return this.prisma.reputationSnapshot.findFirst({
      where: { subjectId: organizationId },
      orderBy: { calculatedAt: "desc" },
    });
  }
}
