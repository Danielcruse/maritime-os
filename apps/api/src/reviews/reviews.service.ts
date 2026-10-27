import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateReviewDto } from "./dto/create-review.dto";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(assignmentId: string, reviewerOrgId: string, userId: string, dto: CreateReviewDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({ where: { id: assignmentId }, include: { listing: true } });
      if (!assignment) throw new NotFoundException("Assignment not found.");
      if (assignment.status !== "confirmed") {
        throw new BadRequestException("Reviews may only be submitted for confirmed assignments.");
      }

      const employerOrgId = assignment.listing.organizationId;
      const participantOrgId = assignment.awardedToOrgId;
      if (reviewerOrgId !== employerOrgId && reviewerOrgId !== participantOrgId) {
        throw new ForbiddenException("Only a party to this assignment may leave a review.");
      }
      const revieweeOrgId = reviewerOrgId === employerOrgId ? participantOrgId : employerOrgId;

      try {
        const review = await tx.review.create({
          data: {
            assignmentId,
            reviewerOrgId,
            revieweeOrgId,
            authorUserId: userId,
            rating: dto.rating,
            comment: dto.comment,
          },
        });
        await this.auditService.record(
          {
            actorId: userId,
            eventType: "review.created",
            entityType: "review",
            entityId: review.id,
            payload: { assignmentId, revieweeOrgId, rating: dto.rating },
          },
          tx,
        );
        return review;
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new ConflictException("This organization has already reviewed this assignment.");
        }
        throw err;
      }
    });
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.review.findMany({
      where: { revieweeOrgId: organizationId, status: "active" },
      orderBy: { createdAt: "desc" },
    });
  }
}
