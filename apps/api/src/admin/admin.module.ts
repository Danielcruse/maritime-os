import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "../common/guards/admin.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AssignmentsModule } from "../assignments/assignments.module";

@Module({
  imports: [OrganizationsModule, AssignmentsModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
