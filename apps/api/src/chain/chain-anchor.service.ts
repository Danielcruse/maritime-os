import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Batches audit events into a Merkle root and anchors it on an
 * EVM-compatible chain. NOT WIRED TO A LIVE NETWORK in this MVP — no
 * contract has been written, tested or deployed yet (blueprint section 6).
 * This service exists so the rest of the system (ChainAnchor rows, pending/
 * confirmed/failed states, reconciliation shape) is already correct when a
 * real chain adapter is dropped in; calling `submitBatch` today creates a
 * `pending` row that will never be confirmed by a background worker, because
 * none exists yet. Treat this as a documented stub, not a working integration.
 */
@Injectable()
export class ChainAnchorService {
  private readonly logger = new Logger(ChainAnchorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  buildMerkleRoot(leafHashes: string[]): string {
    if (leafHashes.length === 0) {
      throw new Error("Cannot build a Merkle root from an empty event batch.");
    }
    let level = [...leafHashes].sort(); // deterministic ordering
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? level[i]; // duplicate last node on odd counts
        next.push(createHash("sha256").update(left + right).digest("hex"));
      }
      level = next;
    }
    return level[0];
  }

  async submitBatch(eventIds: string[], leafHashes: string[]) {
    const chainIdRaw = this.configService.get<string>("CHAIN_ID");
    const contractAddress = this.configService.get<string>("CHAIN_ANCHOR_CONTRACT_ADDRESS");

    if (!chainIdRaw || !contractAddress) {
      this.logger.warn(
        "Chain anchoring is not configured (CHAIN_ID / CHAIN_ANCHOR_CONTRACT_ADDRESS missing). " +
          "Recording a pending anchor locally; no transaction will be submitted.",
      );
    }

    const batchRoot = this.buildMerkleRoot(leafHashes);

    return this.prisma.chainAnchor.create({
      data: {
        batchRoot,
        chainId: chainIdRaw ? Number(chainIdRaw) : 0,
        contractAddress: contractAddress ?? "0x0000000000000000000000000000000000000000",
        eventCount: eventIds.length,
        status: "pending",
      },
    });
  }

  async getStatus(anchorId: string) {
    const anchor = await this.prisma.chainAnchor.findUnique({ where: { id: anchorId } });
    if (!anchor) throw new NotFoundException("Anchor not found.");
    return anchor;
  }
}
