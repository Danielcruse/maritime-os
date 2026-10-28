import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { PrismaService } from "../prisma/prisma.service";
import { ANCHOR_REGISTRY_ABI } from "./anchor-registry.abi";

/**
 * Batches audit events into a Merkle root and anchors it on an
 * EVM-compatible chain via contracts/src/AnchorRegistry.sol.
 *
 * In this sandbox that chain is a local `anvil` node (see
 * docs/architecture.md), not a public testnet or mainnet — real
 * transactions, real signatures, real contract state, but an ephemeral
 * single-node chain that resets if `anvil` restarts. Swap CHAIN_RPC_URL /
 * CHAIN_ID / CHAIN_ANCHOR_CONTRACT_ADDRESS / CHAIN_SIGNER_PRIVATE_KEY for a
 * real network's values before trusting this in production; nothing here
 * assumes a specific chain.
 *
 * When those env vars are unset, `submitBatch` falls back to its original
 * behavior: record a local-only `pending` row and submit nothing. That keeps
 * unit tests and any environment without a configured chain working exactly
 * as before this file changed.
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

  private isChainConfigured(): boolean {
    return Boolean(
      this.configService.get<string>("CHAIN_RPC_URL") &&
        this.configService.get<string>("CHAIN_ID") &&
        this.configService.get<string>("CHAIN_ANCHOR_CONTRACT_ADDRESS") &&
        this.configService.get<string>("CHAIN_SIGNER_PRIVATE_KEY"),
    );
  }

  private getContract(): Contract {
    const rpcUrl = this.configService.get<string>("CHAIN_RPC_URL")!;
    const contractAddress = this.configService.get<string>("CHAIN_ANCHOR_CONTRACT_ADDRESS")!;
    const privateKey = this.configService.get<string>("CHAIN_SIGNER_PRIVATE_KEY")!;
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    return new Contract(contractAddress, ANCHOR_REGISTRY_ABI, wallet);
  }

  /** Packs a UUID (dashes or not) into a bytes32 for the contract's offChainRef parameter. */
  private refToBytes32(uuid: string): string {
    const hex = uuid.replace(/-/g, "").toLowerCase();
    return "0x" + hex.padStart(64, "0");
  }

  async submitBatch(eventIds: string[], leafHashes: string[]) {
    const batchRoot = this.buildMerkleRoot(leafHashes);
    const chainIdRaw = this.configService.get<string>("CHAIN_ID");
    const contractAddress = this.configService.get<string>("CHAIN_ANCHOR_CONTRACT_ADDRESS");

    if (!this.isChainConfigured()) {
      this.logger.warn(
        "Chain anchoring is not configured (CHAIN_RPC_URL / CHAIN_ID / CHAIN_ANCHOR_CONTRACT_ADDRESS / " +
          "CHAIN_SIGNER_PRIVATE_KEY missing). Recording a pending anchor locally; no transaction will be submitted.",
      );
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

    // Created before the on-chain call so a reverted/failed transaction still
    // leaves an honest "failed" row instead of silently losing the attempt.
    const anchorRow = await this.prisma.chainAnchor.create({
      data: {
        batchRoot,
        chainId: Number(chainIdRaw),
        contractAddress: contractAddress!,
        eventCount: eventIds.length,
        status: "pending",
      },
    });

    try {
      const contract = this.getContract();
      const offChainRef = this.refToBytes32(anchorRow.id);
      const tx = await contract.submitAnchor(`0x${batchRoot}`, BigInt(eventIds.length), offChainRef);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction reverted (status=${receipt?.status ?? "unknown"}).`);
      }

      return this.prisma.chainAnchor.update({
        where: { id: anchorRow.id },
        data: {
          status: "confirmed",
          txHash: receipt.hash,
          blockNumber: BigInt(receipt.blockNumber),
          confirmedAt: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.error(`On-chain anchor submission failed for anchor ${anchorRow.id}: ${err?.message ?? err}`);
      return this.prisma.chainAnchor.update({
        where: { id: anchorRow.id },
        data: { status: "failed" },
      });
    }
  }

  async getStatus(anchorId: string) {
    const anchor = await this.prisma.chainAnchor.findUnique({ where: { id: anchorId } });
    if (!anchor) throw new NotFoundException("Anchor not found.");
    return anchor;
  }

  async list(limit = 50) {
    return this.prisma.chainAnchor.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
}
