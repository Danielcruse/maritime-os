# Maritime OS — architecture notes

## Layout

Modular monolith, not microservices (per the blueprint — a small team cannot
operate a dozen services reliably). `apps/api` is a single NestJS process
with one module per domain (`auth`, `organizations`, `listings`,
`applications`, `assignments`, `credentials`, `reviews`, `reputation`,
`points`, `audit`, `chain`, `admin`). `apps/web` is a thin Next.js client.
`database/prisma/schema.prisma` is the single source of truth for the data
model; `contracts/` is reserved for the Solidity work in Milestone 5 and is
currently empty.

## Why hash-chained audit events before blockchain anchoring

`AuditService` (`apps/api/src/audit/audit.service.ts`) gives every audit row
a `payloadHash` computed over its own content **and** the previous row's
hash. Altering or deleting a past row breaks the chain for everything after
it. This gets tamper-evidence immediately, without waiting on the chain
adapter — and it's exactly the leaf data `ChainAnchorService` will batch into
a Merkle root once a real network is wired in. A reader can independently
recompute `verifyChain()` over any slice of history.

## State machines enforced in the service layer

- **Listing**: `draft → open → awarded | cancelled | expired`. Only the
  owning org's `owner`/`admin` members can publish or cancel; publishing a
  `draft` and awarding from `open` are the only forward transitions a
  listing goes through on the happy path.
- **Application**: `submitted → shortlisted/withdrawn/rejected/awarded`.
  Awarding one application auto-rejects every other `submitted`/
  `shortlisted` application on the same listing in the same transaction.
- **Assignment**: `active → evidence_submitted → confirmed`, with
  `disputed`/`cancelled` as side exits. The employer org (the listing's
  `organizationId`) can never equal the assigned org, so "a participant
  cannot confirm their own completion" is a structural invariant, not just a
  runtime check — `AssignmentsService.confirm` still asserts it explicitly
  for defense in depth.

Every transition writes an `AssignmentEvent` row and an audit event in the
**same** Prisma transaction as the state change, per the blueprint's
"critical state transitions and their audit event must share a database
transaction" rule.

## Idempotency

- `PointsService.award` is keyed on a unique `idempotencyKey` column.
  `AssignmentsService.confirm` always calls it with the deterministic key
  `assignment:<id>:completed`, so a retried confirm (client timeout, load
  balancer retry, etc.) awards points exactly once — verified by the e2e
  test's "repeated confirm" step.
- `AssignmentsService.award` is idempotent by construction: `Assignment`
  has unique constraints on both `listingId` and `awardedApplicationId`, so
  re-awarding the *same* application returns the existing assignment, and
  awarding a *different* application after the fact is rejected outright.

## Known limitations (read before treating anything here as production-ready)

- **No separate "authorized credential issuer" designation.** Any verified
  organization can currently issue a credential to anyone. The blueprint
  (sections 4 and 10) calls for issuer authorization as its own concept —
  this needs its own table and admin workflow before credentials mean
  anything in a real deployment.
- **`AdminGuard` is an env-var allowlist of user IDs**, not a real
  `admin_users` table with role assignment. Fine for development, not for
  production — see acceptance criterion 14 in the founder's brief.
- **Chain anchoring is a documented stub.** `ChainAnchorService` can build a
  Merkle root and insert a `pending` `ChainAnchor` row, but nothing submits
  that root to an actual EVM network, and no contract exists yet in
  `contracts/`. No network has been selected. Treat every `ChainAnchor` row
  this code creates as permanently pending until that work lands.
- **Object storage is not integrated.** `storageKey` fields on
  `CredentialEvidence` and `CompletionEvidence` are opaque strings the API
  trusts the caller to have already uploaded correctly — there is no
  signed-upload endpoint yet, so nothing currently validates file type,
  size, or malware status.
- **Reputation and points formulas are first-pass, not validated against
  real transaction data.** They are versioned (`REPUTATION_SCORE_VERSION`,
  `POINTS_RULES_VERSION`) so they can change without corrupting historical
  snapshots, but the specific weights are placeholders pending real pilot
  data, exactly as the blueprint expects for a first release.
- **No rate-limit tuning, no WAF, no dependency/secret scanning wired into
  CI** — `ThrottlerModule` is on with a single global default, nothing more.
- **AI, route intelligence, ocean research**: not started. Correctly out of
  scope for this MVP per the blueprint.

## What has and hasn't run

This project was scaffolded in a sandbox with no Docker and no local
PostgreSQL installation (confirmed: `docker --version` → not found, `psql`
→ not found). That means:

- `npm install`, `prisma generate`, the TypeScript build, and the Jest
  **unit** tests (pure functions with no database: `maritime-id.spec.ts`,
  `reputation-calculator.spec.ts`, `credential-signing.spec.ts`,
  `chain-anchor.service.spec.ts`, `audit.service.spec.ts`) could actually be
  run and their real output is what's reported in the top-level README.
- The Prisma migration, the seed script, and the **e2e** test
  (`marketplace-lifecycle.e2e-spec.ts`, which exercises the full
  register → verify → publish → apply → award → confirm → points journey
  against a real database) have **not** been run anywhere. They need
  `docker compose up -d db` (or any reachable Postgres 16) plus
  `npm run prisma:migrate:deploy` first. Do not take their existence as
  proof they pass — run them before trusting this slice in a pilot.
