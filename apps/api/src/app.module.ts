import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { ListingsModule } from "./listings/listings.module";
import { ApplicationsModule } from "./applications/applications.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { ReputationModule } from "./reputation/reputation.module";
import { PointsModule } from "./points/points.module";
import { AdminModule } from "./admin/admin.module";
import { ChainModule } from "./chain/chain.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CredentialsModule,
    ListingsModule,
    ApplicationsModule,
    AssignmentsModule,
    ReviewsModule,
    ReputationModule,
    PointsModule,
    AdminModule,
    ChainModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
