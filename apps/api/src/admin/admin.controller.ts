import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AdminGuard } from "../common/guards/admin.guard";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { OrganizationsService } from "../organizations/organizations.service";
import { VerificationDecisionDto } from "../organizations/dto/verification-decision.dto";
import { ListVerificationCasesDto } from "./dto/list-verification-cases.dto";
import { AssignmentsService } from "../assignments/assignments.service";
import { ResolveDisputeDto } from "../assignments/dto/resolve-dispute.dto";
import { ListDisputesDto } from "./dto/list-disputes.dto";
import { AuditService } from "../audit/audit.service";
import { ChainAnchorService } from "../chain/chain-anchor.service";

// Caps how many audit events get folded into a single anchor transaction —
// not a chain gas limit concern on a local dev chain, but a sane bound for
// how much any one Merkle batch should cover.
const ANCHOR_BATCH_LIMIT = 500;

@Controller({ path: "admin", version: "1" })
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly auditService: AuditService,
    private readonly chainAnchorService: ChainAnchorService,
  ) {}

  @Get("verification-cases")
  async list(@Query() query: ListVerificationCasesDto) {
    return { data: await this.organizationsService.listVerificationCases(query.decision) };
  }

  @Post("verification-cases/:id/decision")
  async decide(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerificationDecisionDto,
  ) {
    return { data: await this.organizationsService.decideVerification(id, user.userId, dto) };
  }

  @Get("disputes")
  async listDisputes(@Query() query: ListDisputesDto) {
    return { data: await this.assignmentsService.listDisputes(query.status) };
  }

  @Post("disputes/:id/decision")
  async decideDispute(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolveDisputeDto,
  ) {
    return { data: await this.assignmentsService.resolveDispute(id, user.userId, dto) };
  }

  @Get("chain/anchors")
  async listAnchors() {
    return { data: await this.chainAnchorService.list() };
  }

  /**
   * Folds every not-yet-anchored audit event (oldest first, capped at
   * ANCHOR_BATCH_LIMIT) into one Merkle root and submits it on-chain.
   * Explicit admin action rather than a cron job — there is no job
   * scheduler wired up in this MVP (see docs/architecture.md).
   */
  @Post("chain/anchor")
  async anchorPendingEvents() {
    const events = await this.auditService.findUnanchored(ANCHOR_BATCH_LIMIT);
    if (events.length === 0) {
      throw new BadRequestException("No unanchored audit events to submit.");
    }

    const anchor = await this.chainAnchorService.submitBatch(
      events.map((e) => e.id),
      events.map((e) => e.payloadHash),
    );

    // "pending" still means a real transaction was broadcast (it has a
    // txHash) — only "failed" means these events were never actually
    // submitted and should stay eligible for the next batch.
    if (anchor.status === "confirmed" || anchor.status === "pending") {
      await this.auditService.markAnchored(events.map((e) => e.id), anchor.id);
    }

    return { data: anchor };
  }

  /** Checks every still-pending anchor against the chain and updates its status. Also runs automatically on every read. */
  @Post("chain/reconcile")
  async reconcileAnchors() {
    return { data: await this.chainAnchorService.reconcilePending() };
  }
}
