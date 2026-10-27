import { Module } from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { ListingsController } from "./listings.controller";
import { OrganizationsModule } from "../organizations/organizations.module";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";

@Module({
  imports: [OrganizationsModule],
  controllers: [ListingsController],
  providers: [ListingsService, OrgMembershipGuard],
  exports: [ListingsService],
})
export class ListingsModule {}
