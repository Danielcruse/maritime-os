import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PointsService } from "../points/points.service";
import { ReputationService } from "../reputation/reputation.service";
import { SubmitEvidenceDto } from "./dto/submit-evidence.dto";
import { OpenDisputeDto } from "./dto/open-dispute.dto";

const ASSIGNMENT_COMPLETION_POINTS = "50.00";

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pointsService: PointsService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Awards an application. Idempotent by construction: Assignment.listingId
   * and Assignment.awardedApplicationId are both unique, so a retried award
   * of the SAME application on the SAME listing returns the existing
   * assignment instead of erroring or creating a second one; awarding a
   * DIFFERENT application on an already-awarded listing is rejected.
   */
  async award(listingId: string, applicationId: string, ownerOrgId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.freightListing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException("Listing not found.");
      if (listing.organizationId !== ownerOrgId) {
        throw new ForbiddenException("Only the listing owner may award it.");
      }

      const existingAssignment = await tx.assignment.findUnique({ where: { listingId } });
      if (existingAssignment) {
        if (existingAssignment.awardedApplicationId === applicationId) {
          return existingAssignment; // idempotent retry
        }
        throw new BadRequestException("This listing has already been awarded to a different application.");
      }

      if (listing.status !== "open") {
        throw new BadRequestException(`Cannot award a listing in status "${listing.status}".`);
      }

      const application = await tx.listingApplication.findUnique({ where: { id: applicationId } });
      if (!application || application.listingId !== listingId) {
        throw new NotFoundException("Application not found on this listing.");
      }
      if (application.status !== "submitted" && application.status !== "shortlisted") {
        throw new BadRequestException(`Cannot award an application in status "${application.status}".`);
      }

      const assignment = await tx.assignment.create({
        data: {
          listingId,
          awardedApplicationId: applicationId,
          awardedToOrgId: application.applicantOrgId,
        },
      });

      await tx.listingApplication.update({ where: { id: applicationId }, data: { status: "awarded" } });
      await tx.listingApplication.updateMany({
        where: { listingId, id: { not: applicationId }, status: { in: ["submitted", "shortlisted"] } },
        data: { status: "rejected" },
      });
      await tx.freightListing.update({ where: { id: listingId }, data: { status: "awarded" } });

      await tx.assignmentEvent.create({
        data: { assignmentId: assignment.id, eventType: "awarded", actorId: userId, payload: { applicationId } },
      });
      await this.auditService.record(
        {
          actorId: userId,
          eventType: "assignment.awarded",
          entityType: "assignment",
          entityId: assignment.id,
          payload: { listingId, applicationId, awardedToOrgId: application.applicantOrgId },
        },
        tx,
      );

      return assignment;
    });
  }

  async submitEvidence(assignmentId: string, assignedOrgId: string, userId: string, dto: SubmitEvidenceDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({ where: { id: assignmentId } });
      if (!assignment) throw new NotFoundException("Assignment not found.");
      if (assignment.awardedToOrgId !== assignedOrgId) {
        throw new ForbiddenException("Only the assigned organization may submit completion evidence.");
      }
      if (assignment.status !== "active" && assignment.status !== "evidence_submitted") {
        throw new BadRequestException(`Cannot submit evidence for an assignment in status "${assignment.status}".`);
      }

      const evidence = await tx.completionEvidence.create({
        data: {
          assignmentId,
          submittedBy: userId,
          storageKey: dto.storageKey,
          contentHash: dto.contentHash,
        },
      });

      if (assignment.status !== "evidence_submitted") {
        await tx.assignment.update({ where: { id: assignmentId }, data: { status: "evidence_submitted" } });
      }
      await tx.assignmentEvent.create({
        data: { assignmentId, eventType: "evidence_submitted", actorId: userId, payload: { evidenceId: evidence.id } },
      });
      await this.auditService.record(
        {
          actorId: userId,
          eventType: "assignment.evidence_submitted",
          entityType: "assignment",
          entityId: assignmentId,
          payload: { evidenceId: evidence.id },
        },
        tx,
      );

      return evidence;
    });
  }

  /**
   * Confirms completion as the independent employer. A participant can
   * never confirm their own work — `employerOrgId` must be the listing's
   * organization, which by construction (applications are rejected for the
   * listing's own org) can never equal the assigned org.
   */
  async confirm(assignmentId: string, employerOrgId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: assignmentId },
        include: { listing: true },
      });
      if (!assignment) throw new NotFoundException("Assignment not found.");
      if (assignment.listing.organizationId !== employerOrgId) {
        throw new ForbiddenException("Only the listing's owning organization may confirm completion.");
      }
      if (assignment.awardedToOrgId === employerOrgId) {
        throw new ForbiddenException("A participant cannot confirm their own completion.");
      }

      if (assignment.status === "confirmed") {
        return assignment; // idempotent retry
      }
      if (assignment.status !== "evidence_submitted") {
        throw new BadRequestException(
          `Cannot confirm an assignment in status "${assignment.status}" — evidence must be submitted first.`,
        );
      }

      const updated = await tx.assignment.update({ where: { id: assignmentId }, data: { status: "confirmed" } });
      await tx.assignmentEvent.create({
        data: { assignmentId, eventType: "confirmed", actorId: userId, payload: {} },
      });
      await this.auditService.record(
        { actorId: userId, eventType: "assignment.confirmed", entityType: "assignment", entityId: assignmentId, payload: {} },
        tx,
      );

      const application = await tx.listingApplication.findUnique({
        where: { id: assignment.awardedApplicationId },
      });
      if (application) {
        await this.pointsService.award(
          {
            userId: application.applicantUserId,
            amount: ASSIGNMENT_COMPLETION_POINTS,
            referenceType: "assignment_completed",
            referenceId: assignmentId,
            idempotencyKey: `assignment:${assignmentId}:completed`,
          },
          tx,
        );
      }

      return updated;
    }).then(async (result) => {
      // Reputation recalculation reads committed state, so it runs after the
      // transaction above commits rather than inside it.
      const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
      if (assignment) await this.reputationService.recalculateForOrganization(assignment.awardedToOrgId);
      return result;
    });
  }

  async openDispute(assignmentId: string, userId: string, participantOrgIds: string[], dto: OpenDisputeDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({ where: { id: assignmentId }, include: { listing: true } });
      if (!assignment) throw new NotFoundException("Assignment not found.");

      const isParty =
        participantOrgIds.includes(assignment.awardedToOrgId) ||
        participantOrgIds.includes(assignment.listing.organizationId);
      if (!isParty) {
        throw new ForbiddenException("Only a party to this assignment may open a dispute.");
      }
      if (assignment.status === "confirmed" || assignment.status === "cancelled") {
        throw new BadRequestException(`Cannot open a dispute on an assignment in status "${assignment.status}".`);
      }

      const dispute = await tx.dispute.create({
        data: { assignmentId, openedBy: userId, reason: dto.reason },
      });
      await tx.assignment.update({ where: { id: assignmentId }, data: { status: "disputed" } });
      await tx.assignmentEvent.create({
        data: { assignmentId, eventType: "dispute_opened", actorId: userId, payload: { disputeId: dispute.id } },
      });
      await this.auditService.record(
        {
          actorId: userId,
          eventType: "assignment.dispute_opened",
          entityType: "assignment",
          entityId: assignmentId,
          payload: { disputeId: dispute.id },
        },
        tx,
      );

      return dispute;
    });
  }

  async getById(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { events: { orderBy: { createdAt: "asc" } }, evidence: true, disputes: true },
    });
    if (!assignment) throw new NotFoundException("Assignment not found.");
    return assignment;
  }

  /** Lets an applicant discover the assignment created once their listing is awarded. Null, not 404 — "not yet awarded" is a normal state. */
  async getByListingId(listingId: string) {
    return this.prisma.assignment.findUnique({ where: { listingId } });
  }
}
