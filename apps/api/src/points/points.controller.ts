import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { PointsService } from "./points.service";

@Controller({ path: "me/points", version: "1" })
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get()
  async getHistory(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.pointsService.history(user.userId) };
  }
}
