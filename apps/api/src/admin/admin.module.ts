import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "../common/guards/admin.guard";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [OrganizationsModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
