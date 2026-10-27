import { Module } from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import { ReviewsController } from "./reviews.controller";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, OrgMembershipGuard],
  exports: [ReviewsService],
})
export class ReviewsModule {}
