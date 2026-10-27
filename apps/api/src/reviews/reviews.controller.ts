import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";

@Controller({ version: "1" })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post("assignments/:id/reviews/organizations/:organizationId")
  @UseGuards(JwtAuthGuard, OrgMembershipGuard)
  async create(
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return { data: await this.reviewsService.create(id, organizationId, user.userId, dto) };
  }

  @Get("organizations/:id/reviews")
  async listForOrganization(@Param("id") id: string) {
    return { data: await this.reviewsService.listForOrganization(id) };
  }
}
