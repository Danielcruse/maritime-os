import { Module } from "@nestjs/common";
import { ApplicationsService } from "./applications.service";
import { ApplicationsController } from "./applications.controller";
import { OrganizationsModule } from "../organizations/organizations.module";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";

@Module({
  imports: [OrganizationsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, OrgMembershipGuard],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
