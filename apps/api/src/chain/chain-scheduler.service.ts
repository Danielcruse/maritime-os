import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChainAnchorService } from "./chain-anchor.service";
import { AuditService } from "../audit/audit.service";

const DEFAULT_INTERVAL_SECONDS = 120;
const ANCHOR_BATCH_LIMIT = 500; // kept in sync with admin.controller.ts's manual-trigger limit by hand

/**
 * The one piece every "read-triggered, manually triggerable" admin action
 * elsewhere in this file's docs was missing: something that actually runs
 * them without a human clicking a button. A plain `setInterval` inside a
 * NestJS lifecycle hook, not a cron library — this project has no job
 * queue (Redis is configured but unused), and a single periodic tick that
 * anchors anything pending, reconciles anything unconfirmed, and checks
 * for reorgs is simple enough not to need one. Runs only when the chain
 * is configured at all (CHAIN_RPC_URL etc.) and the interval is nonzero —
 * CHAIN_SCHEDULER_INTERVAL_SECONDS=0 disables it, e.g. for tests that
 * don't want a background timer outliving the test process.
 */
@Injectable()
export class ChainSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChainSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly chainAnchorService: ChainAnchorService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    const intervalSeconds = Number(this.configService.get<string>("CHAIN_SCHEDULER_INTERVAL_SECONDS") ?? DEFAULT_INTERVAL_SECONDS);
    if (!intervalSeconds || intervalSeconds <= 0) {
      this.logger.log("Chain scheduler disabled (CHAIN_SCHEDULER_INTERVAL_SECONDS=0).");
      return;
    }
    this.logger.log(`Chain scheduler running every ${intervalSeconds}s (anchor pending → reconcile → check reorgs).`);
    this.timer = setInterval(() => void this.tick(), intervalSeconds * 1000);
    this.timer.unref?.(); // never keep the process alive on its own — tests and shutdown shouldn't wait on this
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    // A slow chain or a stalled RPC call could make one tick overrun the
    // next; skip rather than pile up concurrent ticks against the same rows.
    if (this.tickInFlight) {
      this.logger.warn("Previous tick still running — skipping this one.");
      return;
    }
    this.tickInFlight = true;
    try {
      // Without a configured chain, submitBatch would still create a
      // local-only "pending" row on every tick — harmless but noisy.
      // Skip auto-anchoring entirely rather than accumulate those.
      const unanchored = this.chainAnchorService.isConfigured() ? await this.auditService.findUnanchored(ANCHOR_BATCH_LIMIT) : [];
      if (unanchored.length > 0) {
        const anchor = await this.chainAnchorService.submitBatch(
          unanchored.map((e) => e.id),
          unanchored.map((e) => e.payloadHash),
        );
        if (anchor.status === "confirmed" || anchor.status === "pending") {
          await this.auditService.markAnchored(unanchored.map((e) => e.id), anchor.id);
        }
        this.logger.log(`Auto-anchored ${unanchored.length} event(s) — anchor ${anchor.id} (${anchor.status}).`);
      }

      const reconciled = await this.chainAnchorService.reconcilePending();
      if (reconciled.checked > 0) {
        this.logger.log(
          `Reconciled ${reconciled.checked} pending anchor(s): ${reconciled.confirmed} confirmed, ${reconciled.failed} failed.`,
        );
      }

      const reorgs = await this.chainAnchorService.detectReorgs();
      if (reorgs.reorgAffected > 0) {
        this.logger.warn(`Reorg check: ${reorgs.reorgAffected} of ${reorgs.checked} confirmed anchor(s) were reorganized out.`);
      }
    } catch (err: any) {
      this.logger.error(`Chain scheduler tick failed: ${err?.message ?? err}`);
    } finally {
      this.tickInFlight = false;
    }
  }
}
