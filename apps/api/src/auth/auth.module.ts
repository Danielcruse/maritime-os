import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Module({
  // `global: true` makes JwtService resolvable from every module without
  // each one importing AuthModule — required because JwtAuthGuard (used via
  // @UseGuards across nearly every controller) depends on it, and Nest
  // resolves a guard's dependencies within the enclosing controller's own
  // module scope, not AuthModule's.
  imports: [ConfigModule, JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
