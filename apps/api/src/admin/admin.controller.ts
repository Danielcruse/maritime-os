import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AdminGuard } from "../common/guards/admin.guard";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { OrganizationsService } from "../organizations/organizations.service";
import { VerificationDecisionDto } from "../organizations/dto/verification-decision.dto";
import { ListVerificationCasesDto } from "./dto/list-verification-cases.dto";

@Controller({ path: "admin", version: "1" })
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("verification-cases")
  async list(@Query() query: ListVerificationCasesDto) {
    return { data: await this.organizationsService.listVerificationCases(query.decision) };
  }

  @Post("verification-cases/:id/decision")
  async decide(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerificationDecisionDto,
  ) {
    return { data: await this.organizationsService.decideVerification(id, user.userId, dto) };
  }
}
