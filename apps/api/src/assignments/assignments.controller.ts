import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { RequireOrgRoles } from "../common/decorators/require-org-roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { AssignmentsService } from "./assignments.service";
import { SubmitEvidenceDto } from "./dto/submit-evidence.dto";
import { OpenDisputeDto } from "./dto/open-dispute.dto";
import { PrismaService } from "../prisma/prisma.service";

@Controller({ version: "1" })
export class AssignmentsController {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("listings/:listingId/applications/:applicationId/award/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async award(
    @Param("listingId") listingId: string,
    @Param("applicationId") applicationId: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      data: await this.assignmentsService.award(listingId, applicationId, organizationId, user.userId),
    };
  }

  @Get("assignments/:id")
  @UseGuards(JwtAuthGuard)
  async getById(@Param("id") id: string) {
    return { data: await this.assignmentsService.getById(id) };
  }

  @Get("listings/:listingId/assignment")
  @UseGuards(JwtAuthGuard)
  async getByListingId(@Param("listingId") listingId: string) {
    return { data: await this.assignmentsService.getByListingId(listingId) };
  }

  @Post("assignments/:id/evidence/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin", "member")
  async submitEvidence(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitEvidenceDto,
  ) {
    return { data: await this.assignmentsService.submitEvidence(id, organizationId, user.userId, dto) };
  }

  @Post("assignments/:id/confirm/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async confirm(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { data: await this.assignmentsService.confirm(id, organizationId, user.userId) };
  }

  @Post("assignments/:id/disputes")
  @UseGuards(JwtAuthGuard)
  async openDispute(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenDisputeDto,
  ) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.userId, status: "active" },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    return { data: await this.assignmentsService.openDispute(id, user.userId, orgIds, dto) };
  }
}
