import { Controller, Get, Param } from "@nestjs/common";
import { ChainAnchorService } from "./chain-anchor.service";
import { AuditService } from "../audit/audit.service";

// Was "audit/anchors" — renamed because that shape collided with
// AuditController's "audit/:entityType/:id" (entityType could be "anchors"),
// and the wildcard route happened to win registration order, silently
// shadowing these two endpoints entirely. Not a theoretical risk: this is
// exactly what happened when they were first wired up and tested live.
@Controller({ path: "chain/anchors", version: "1" })
export class ChainController {
  constructor(
    private readonly chainAnchorService: ChainAnchorService,
    private readonly auditService: AuditService,
  ) {}

  @Get(":id")
  async getStatus(@Param("id") id: string) {
    return { data: await this.chainAnchorService.getStatus(id) };
  }

  // Public, privacy-limited like credential verification: metadata only
  // (event type, entity, payload hash), never the raw payload — it may hold
  // free-text notes or reasons. Lets anyone independently recompute the
  // Merkle root from these hashes and compare it to the anchor's batchRoot.
  @Get(":id/events")
  async getEvents(@Param("id") id: string) {
    await this.chainAnchorService.getStatus(id); // 404s if the anchor doesn't exist
    return { data: await this.auditService.listForAnchor(id) };
  }
}
