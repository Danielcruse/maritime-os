-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('pending', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended', 'removed');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('pending', 'approved', 'rejected', 'more_info_requested');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('pending', 'active', 'suspended', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'open', 'closed', 'cancelled', 'awarded', 'expired');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'withdrawn', 'shortlisted', 'rejected', 'awarded');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'evidence_submitted', 'confirmed', 'disputed', 'cancelled');

-- CreateEnum
CREATE TYPE "CompletionEvidenceStatus" AS ENUM ('submitted', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('active', 'hidden', 'removed');

-- CreateEnum
CREATE TYPE "PointsEntryType" AS ENUM ('earn', 'reversal', 'adjustment');

-- CreateEnum
CREATE TYPE "PointsReferenceType" AS ENUM ('assignment_completed', 'credential_verified', 'referral', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved_for_opener', 'resolved_for_counterparty', 'dismissed');

-- CreateEnum
CREATE TYPE "ChainAnchorStatus" AS ENUM ('pending', 'confirmed', 'failed', 'reorg_affected');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "auth_subject" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "maritime_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "profile_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "country_code" CHAR(2) NOT NULL,
    "verification_status" "OrganizationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "decision" "VerificationDecision" NOT NULL DEFAULT 'pending',
    "reason_code" TEXT,
    "notes" TEXT,
    "document_keys" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "issuer_org_id" UUID NOT NULL,
    "credential_type" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'pending',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "signature" TEXT NOT NULL,
    "signature_alg" TEXT NOT NULL DEFAULT 'ed25519',
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_evidence" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "access_policy" TEXT NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "origin" JSONB NOT NULL,
    "destination" JSONB NOT NULL,
    "cargo_summary" TEXT NOT NULL,
    "capacity" JSONB,
    "currency" CHAR(3),
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_applications" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "applicant_org_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "quote_amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "awarded_application_id" UUID NOT NULL,
    "awarded_to_org_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "agreed_terms_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_events" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion_evidence" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "verification_status" "CompletionEvidenceStatus" NOT NULL DEFAULT 'submitted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completion_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution_code" TEXT,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "reviewer_org_id" UUID NOT NULL,
    "reviewee_org_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_snapshots" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "score_version" TEXT NOT NULL,
    "score" DECIMAL(6,3) NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance_cached" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entry_type" "PointsEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" "PointsReferenceType" NOT NULL,
    "reference_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "reverses_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previous_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_anchors" (
    "id" UUID NOT NULL,
    "batch_root" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "tx_hash" TEXT,
    "block_number" BIGINT,
    "status" "ChainAnchorStatus" NOT NULL DEFAULT 'pending',
    "event_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "chain_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_maritime_id_key" ON "user_profiles"("maritime_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_country_code_registration_number_key" ON "organizations"("country_code", "registration_number");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "verification_cases_organization_id_idx" ON "verification_cases"("organization_id");

-- CreateIndex
CREATE INDEX "verification_cases_decision_idx" ON "verification_cases"("decision");

-- CreateIndex
CREATE INDEX "credentials_subject_id_idx" ON "credentials"("subject_id");

-- CreateIndex
CREATE INDEX "credentials_issuer_org_id_idx" ON "credentials"("issuer_org_id");

-- CreateIndex
CREATE INDEX "credential_evidence_credential_id_idx" ON "credential_evidence"("credential_id");

-- CreateIndex
CREATE INDEX "freight_listings_search_idx" ON "freight_listings"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "freight_listings_org_idx" ON "freight_listings"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "listing_applications_listing_id_idx" ON "listing_applications"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_applications_listing_id_applicant_org_id_key" ON "listing_applications"("listing_id", "applicant_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_listing_id_key" ON "assignments"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_awarded_application_id_key" ON "assignments"("awarded_application_id");

-- CreateIndex
CREATE INDEX "assignment_events_assignment_id_created_at_idx" ON "assignment_events"("assignment_id", "created_at");

-- CreateIndex
CREATE INDEX "completion_evidence_assignment_id_idx" ON "completion_evidence"("assignment_id");

-- CreateIndex
CREATE INDEX "disputes_assignment_id_idx" ON "disputes"("assignment_id");

-- CreateIndex
CREATE INDEX "reviews_reviewee_org_id_idx" ON "reviews"("reviewee_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_assignment_id_reviewer_org_id_reviewee_org_id_key" ON "reviews"("assignment_id", "reviewer_org_id", "reviewee_org_id");

-- CreateIndex
CREATE INDEX "reputation_snapshots_subject_id_calculated_at_idx" ON "reputation_snapshots"("subject_id", "calculated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "points_accounts_user_id_key" ON "points_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "points_ledger_idempotency_key_key" ON "points_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "points_ledger_account_id_created_at_idx" ON "points_ledger"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "points_ledger_reference_type_reference_id_idx" ON "points_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "chain_anchors_status_idx" ON "chain_anchors"("status");

-- CreateIndex
CREATE INDEX "chain_anchors_batch_root_idx" ON "chain_anchors"("batch_root");

-- CreateIndex
CREATE INDEX "admin_actions_target_type_target_id_idx" ON "admin_actions"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_issuer_org_id_fkey" FOREIGN KEY ("issuer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_evidence" ADD CONSTRAINT "credential_evidence_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_listings" ADD CONSTRAINT "freight_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_applications" ADD CONSTRAINT "listing_applications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "freight_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_applications" ADD CONSTRAINT "listing_applications_applicant_org_id_fkey" FOREIGN KEY ("applicant_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_applications" ADD CONSTRAINT "listing_applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "freight_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_awarded_application_id_fkey" FOREIGN KEY ("awarded_application_id") REFERENCES "listing_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_awarded_to_org_id_fkey" FOREIGN KEY ("awarded_to_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_events" ADD CONSTRAINT "assignment_events_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_evidence" ADD CONSTRAINT "completion_evidence_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_evidence" ADD CONSTRAINT "completion_evidence_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_org_id_fkey" FOREIGN KEY ("reviewer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_org_id_fkey" FOREIGN KEY ("reviewee_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_snapshots" ADD CONSTRAINT "reputation_snapshots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_accounts" ADD CONSTRAINT "points_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "points_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
