import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { RequireOrgRoles } from "../common/decorators/require-org-roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { OrganizationsService } from "./organizations.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { SubmitVerificationDto } from "./dto/submit-verification.dto";

@Controller({ path: "organizations", version: "1" })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return { data: await this.organizationsService.create(user.userId, dto) };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return { data: await this.organizationsService.getById(id) };
  }

  @Post(":organizationId/verification")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async submitVerification(
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitVerificationDto,
  ) {
    return {
      data: await this.organizationsService.submitVerification(organizationId, user.userId, dto),
    };
  }
}
