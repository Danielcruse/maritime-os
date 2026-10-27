import { Module } from "@nestjs/common";
import { CredentialsService } from "./credentials.service";
import { CredentialsController } from "./credentials.controller";
import { OrganizationsModule } from "../organizations/organizations.module";
import { OrgMembershipGuard } from "../common/guards/org-membership.guard";

@Module({
  imports: [OrganizationsModule],
  controllers: [CredentialsController],
  providers: [CredentialsService, OrgMembershipGuard],
  exports: [CredentialsService],
})
export class CredentialsModule {}
