import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { SubmitVerificationDto } from "./dto/submit-verification.dto";
import { VerificationDecisionDto } from "./dto/verification-decision.dto";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            legalName: dto.legalName,
            registrationNumber: dto.registrationNumber,
            countryCode: dto.countryCode.toUpperCase(),
          },
        });
        await tx.organizationMember.create({
          data: { organizationId: org.id, userId, role: "owner" },
        });
        await this.auditService.record(
          {
            actorId: userId,
            eventType: "organization.created",
            entityType: "organization",
            entityId: org.id,
            payload: { legalName: org.legalName, countryCode: org.countryCode },
          },
          tx,
        );
        return org;
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictException(
          "An organization with this registration number already exists in this jurisdiction.",
        );
      }
      throw err;
    }
  }

  async getById(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException("Organization not found.");
    // Public-safe projection — never return raw verification case notes here.
    return {
      id: org.id,
      legalName: org.legalName,
      countryCode: org.countryCode,
      verificationStatus: org.verificationStatus,
      createdAt: org.createdAt,
    };
  }

  async submitVerification(organizationId: string, userId: string, dto: SubmitVerificationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException("Organization not found.");
    if (org.verificationStatus === "verified") {
      throw new BadRequestException("Organization is already verified.");
    }

    return this.prisma.$transaction(async (tx) => {
      const existingPending = await tx.verificationCase.findFirst({
        where: { organizationId, decision: "pending" },
      });
      if (existingPending) {
        throw new ConflictException("A verification case is already pending for this organization.");
      }

      const vcase = await tx.verificationCase.create({
        data: {
          organizationId,
          documentKeys: dto.documentKeys,
          decision: "pending",
        },
      });

      await this.auditService.record(
        {
          actorId: userId,
          eventType: "verification_case.submitted",
          entityType: "verification_case",
          entityId: vcase.id,
          payload: { organizationId },
        },
        tx,
      );

      return vcase;
    });
  }

  async decideVerification(caseId: string, adminUserId: string, dto: VerificationDecisionDto) {
    return this.prisma.$transaction(async (tx) => {
      const vcase = await tx.verificationCase.findUnique({ where: { id: caseId } });
      if (!vcase) throw new NotFoundException("Verification case not found.");
      if (vcase.decision !== "pending") {
        throw new ConflictException("This verification case has already been decided.");
      }

      const updated = await tx.verificationCase.update({
        where: { id: caseId },
        data: {
          decision: dto.decision,
          reasonCode: dto.reasonCode,
          notes: dto.notes,
          reviewerId: adminUserId,
          decidedAt: new Date(),
        },
      });

      if (dto.decision === "approved") {
        await tx.organization.update({
          where: { id: vcase.organizationId },
          data: { verificationStatus: "verified" },
        });
      } else if (dto.decision === "rejected") {
        await tx.organization.update({
          where: { id: vcase.organizationId },
          data: { verificationStatus: "rejected" },
        });
      }

      await tx.adminAction.create({
        data: {
          adminUserId,
          actionType: "verification_decision",
          targetType: "verification_case",
          targetId: caseId,
          reason: dto.reasonCode,
        },
      });

      await this.auditService.record(
        {
          actorId: adminUserId,
          eventType: "verification_case.decided",
          entityType: "verification_case",
          entityId: caseId,
          payload: { decision: dto.decision, organizationId: vcase.organizationId },
        },
        tx,
      );

      return updated;
    });
  }

  async assertVerifiedOwner(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.verificationStatus !== "verified") {
      throw new ForbiddenException("Organization must be verified before performing this action.");
    }
  }
}
