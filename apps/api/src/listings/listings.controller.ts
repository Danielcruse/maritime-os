import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { RequireOrgRoles } from "../common/decorators/require-org-roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { ListingsService } from "./listings.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { SearchListingsDto } from "./dto/search-listings.dto";

@Controller({ path: "listings", version: "1" })
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  async search(@Query() query: SearchListingsDto) {
    return { data: await this.listingsService.search(query) };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return { data: await this.listingsService.getById(id) };
  }

  @Get("organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin", "member")
  async listForOrganization(@Param("organizationId") organizationId: string) {
    return { data: await this.listingsService.listForOrganization(organizationId) };
  }

  @Post("organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async create(
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateListingDto,
  ) {
    return { data: await this.listingsService.create(organizationId, user.userId, dto) };
  }

  @Post(":id/publish/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async publish(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { data: await this.listingsService.publish(id, organizationId, user.userId) };
  }

  @Post(":id/cancel/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async cancel(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { data: await this.listingsService.cancel(id, organizationId, user.userId) };
  }
}
