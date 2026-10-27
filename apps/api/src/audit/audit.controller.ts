import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuditService } from "./audit.service";

@Controller({ path: "audit", version: "1" })
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // NOTE: MVP-level access control — any authenticated user can read any
  // entity's audit trail. Before production this must be scoped to users
  // who have a legitimate relationship to the entity (org member, assignment
  // party, or admin), matching the "policy-controlled" access noted in the
  // blueprint's endpoint catalogue.
  @Get(":entityType/:id")
  async getHistory(@Param("entityType") entityType: string, @Param("id") id: string) {
    const events = await this.auditService.history(entityType, id);
    return { data: events };
  }
}
