import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { RequireOrgRoles } from "../common/decorators/require-org-roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { CredentialsService } from "./credentials.service";
import { IssueCredentialDto } from "./dto/issue-credential.dto";
import { RevokeCredentialDto } from "./dto/revoke-credential.dto";

@Controller({ version: "1" })
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post("organizations/:organizationId/credentials")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async issue(
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueCredentialDto,
  ) {
    return { data: await this.credentialsService.issue(organizationId, user.userId, dto) };
  }

  @Get("credentials/:id/verify")
  async verify(@Param("id") id: string) {
    return { data: await this.credentialsService.verify(id) };
  }

  @Post("organizations/:organizationId/credentials/:id/revoke")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  @RequireOrgRoles("owner", "admin")
  async revoke(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeCredentialDto,
  ) {
    return { data: await this.credentialsService.revoke(id, organizationId, user.userId, dto) };
  }
}
