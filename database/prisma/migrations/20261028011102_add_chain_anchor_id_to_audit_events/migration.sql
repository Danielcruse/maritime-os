-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "chain_anchor_id" UUID;

-- CreateIndex
CREATE INDEX "audit_events_chain_anchor_id_idx" ON "audit_events"("chain_anchor_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_chain_anchor_id_fkey" FOREIGN KEY ("chain_anchor_id") REFERENCES "chain_anchors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
