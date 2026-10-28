import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ChainAnchorService } from "./chain-anchor.service";
import { AuditService } from "../audit/audit.service";
import { buildMerkleProof, recomputeRootFromProof } from "./merkle";

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

  /**
   * A compact inclusion proof for ONE event — not the whole batch. Checks
   * it three ways and reports all three, rather than just asserting
   * "verified": recomputed off-chain here (so the caller doesn't have to
   * trust this either — they can redo it client-side with the same
   * leaf+proof), and checked against the live contract via a free
   * read-only call. `offChainMatches` and `onChainVerified` can disagree
   * only if the database and the chain have actually diverged.
   */
  @Get(":id/proof/:eventId")
  async getProof(@Param("id") id: string, @Param("eventId") eventId: string) {
    const anchor = await this.chainAnchorService.getStatus(id);
    const events = await this.auditService.listForAnchor(id);
    const target = events.find((e) => e.id === eventId);
    if (!target) throw new NotFoundException("That event is not part of this anchor's batch.");

    const leafHashes = events.map((e) => e.payloadHash);
    const { leaf, proof, siblingIsLeft } = buildMerkleProof(leafHashes, target.payloadHash);
    const offChainRecomputedRoot = recomputeRootFromProof(leaf, proof, siblingIsLeft);
    const offChainMatches = offChainRecomputedRoot === anchor.batchRoot;
    const onChainVerified = await this.chainAnchorService.verifyInclusionOnChain(anchor, leaf, proof, siblingIsLeft);

    return {
      data: {
        anchorId: anchor.id,
        batchRoot: anchor.batchRoot,
        leaf,
        proof,
        siblingIsLeft,
        offChainRecomputedRoot,
        offChainMatches,
        onChainVerified,
      },
    };
  }
}
