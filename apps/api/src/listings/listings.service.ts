import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { SearchListingsDto } from "./dto/search-listings.dto";

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateListingDto) {
    await this.organizationsService.assertVerifiedOwner(organizationId);

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.freightListing.create({
        data: {
          organizationId,
          title: dto.title,
          origin: dto.origin as any,
          destination: dto.destination as any,
          cargoSummary: dto.cargoSummary,
          capacity: dto.capacity as any,
          currency: dto.currency,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: "draft",
        },
      });
      await this.auditService.record(
        {
          actorId: userId,
          eventType: "listing.created",
          entityType: "freight_listing",
          entityId: listing.id,
          payload: { organizationId, title: listing.title },
        },
        tx,
      );
      return listing;
    });
  }

  async publish(listingId: string, organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.freightListing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException("Listing not found.");
      if (listing.organizationId !== organizationId) {
        throw new ForbiddenException("You cannot modify a listing owned by another organization.");
      }
      if (listing.status !== "draft") {
        throw new BadRequestException(`Cannot publish a listing in status "${listing.status}".`);
      }

      const updated = await tx.freightListing.update({
        where: { id: listingId },
        data: { status: "open" },
      });
      await this.auditService.record(
        { actorId: userId, eventType: "listing.published", entityType: "freight_listing", entityId: listingId, payload: {} },
        tx,
      );
      return updated;
    });
  }

  async search(dto: SearchListingsDto) {
    const where = dto.status ? { status: dto.status } : { status: { not: "draft" as const } };
    const [items, total] = await Promise.all([
      this.prisma.freightListing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: dto.limit,
        skip: dto.offset,
      }),
      this.prisma.freightListing.count({ where }),
    ]);
    return { items, total, limit: dto.limit, offset: dto.offset };
  }

  async getById(listingId: string) {
    const listing = await this.prisma.freightListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Listing not found.");
    return listing;
  }

  /** Includes draft listings, unlike `search` — only the owning org's members may call this. */
  async listForOrganization(organizationId: string) {
    return this.prisma.freightListing.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async cancel(listingId: string, organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.freightListing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException("Listing not found.");
      if (listing.organizationId !== organizationId) {
        throw new ForbiddenException("You cannot modify a listing owned by another organization.");
      }
      if (listing.status === "awarded") {
        throw new BadRequestException("Cannot cancel a listing that has already been awarded.");
      }
      const updated = await tx.freightListing.update({ where: { id: listingId }, data: { status: "cancelled" } });
      await this.auditService.record(
        { actorId: userId, eventType: "listing.cancelled", entityType: "freight_listing", entityId: listingId, payload: {} },
        tx,
      );
      return updated;
    });
  }

  /** Called by a scheduled job; marketplace-visible listings past their expiry stop accepting applications. */
  async expireOverdueListings(now = new Date()) {
    return this.prisma.freightListing.updateMany({
      where: { status: "open", expiresAt: { lt: now } },
      data: { status: "expired" },
    });
  }
}
