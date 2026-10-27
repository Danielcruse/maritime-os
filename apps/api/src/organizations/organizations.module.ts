import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgMembershipGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
