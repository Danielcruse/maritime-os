import { Module } from "@nestjs/common";
import { AssignmentsService } from "./assignments.service";
import { AssignmentsController } from "./assignments.controller";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";
import { PointsModule } from "../points/points.module";
import { ReputationModule } from "../reputation/reputation.module";

@Module({
  imports: [PointsModule, ReputationModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, OrgMembershipGuard],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
