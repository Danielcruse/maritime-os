import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { CreateApplicationDto } from "./dto/create-application.dto";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async apply(listingId: string, applicantOrgId: string, userId: string, dto: CreateApplicationDto) {
    await this.organizationsService.assertVerifiedOwner(applicantOrgId);

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.freightListing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException("Listing not found.");
      if (listing.status !== "open") {
        throw new BadRequestException(`This listing is not open for applications (status: ${listing.status}).`);
      }
      if (listing.expiresAt && listing.expiresAt < new Date()) {
        throw new BadRequestException("This listing has expired.");
      }
      if (listing.organizationId === applicantOrgId) {
        throw new ForbiddenException("An organization cannot apply to its own listing.");
      }

      try {
        const application = await tx.listingApplication.create({
          data: {
            listingId,
            applicantOrgId,
            applicantUserId: userId,
            quoteAmount: dto.quoteAmount,
            currency: dto.currency,
            message: dto.message,
          },
        });
        await this.auditService.record(
          {
            actorId: userId,
            eventType: "application.submitted",
            entityType: "listing_application",
            entityId: application.id,
            payload: { listingId, applicantOrgId },
          },
          tx,
        );
        return application;
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new ConflictException("This organization has already applied to this listing.");
        }
        throw err;
      }
    });
  }

  async listForListing(listingId: string, ownerOrgId: string) {
    const listing = await this.prisma.freightListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found.");
    if (listing.organizationId !== ownerOrgId) {
      throw new ForbiddenException("Only the listing owner may review its applications.");
    }
    return this.prisma.listingApplication.findMany({
      where: { listingId },
      orderBy: { createdAt: "asc" },
    });
  }

  async withdraw(applicationId: string, applicantOrgId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.listingApplication.findUnique({ where: { id: applicationId } });
      if (!application) throw new NotFoundException("Application not found.");
      if (application.applicantOrgId !== applicantOrgId) {
        throw new ForbiddenException("You cannot withdraw another organization's application.");
      }
      if (application.status !== "submitted" && application.status !== "shortlisted") {
        throw new BadRequestException(`Cannot withdraw an application in status "${application.status}".`);
      }
      const updated = await tx.listingApplication.update({
        where: { id: applicationId },
        data: { status: "withdrawn" },
      });
      await this.auditService.record(
        { actorId: userId, eventType: "application.withdrawn", entityType: "listing_application", entityId: applicationId, payload: {} },
        tx,
      );
      return updated;
    });
  }
}
