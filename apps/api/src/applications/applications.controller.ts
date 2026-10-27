import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { RequireOrgRoles } from "../common/decorators/require-org-roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { ApplicationsService } from "./applications.service";
import { CreateApplicationDto } from "./dto/create-application.dto";

@Controller({ version: "1" })
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post("listings/:listingId/applications/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin", "member")
  async apply(
    @Param("listingId") listingId: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApplicationDto,
  ) {
    return { data: await this.applicationsService.apply(listingId, organizationId, user.userId, dto) };
  }

  @Get("listings/:listingId/applications/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async list(@Param("listingId") listingId: string, @Param("organizationId") organizationId: string) {
    return { data: await this.applicationsService.listForListing(listingId, organizationId) };
  }

  @Post("applications/:id/withdraw/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin", "member")
  async withdraw(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { data: await this.applicationsService.withdraw(id, organizationId, user.userId) };
  }
}
