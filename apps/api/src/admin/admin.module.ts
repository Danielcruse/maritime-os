import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "../common/guards/admin.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AssignmentsModule } from "../assignments/assignments.module";
import { ChainModule } from "../chain/chain.module";

@Module({
  imports: [OrganizationsModule, AssignmentsModule, ChainModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
