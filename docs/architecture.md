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
- **Uploads exist but are local-disk only, not real object storage.**
  `StorageService` (`apps/api/src/storage/storage.service.ts`) writes to
  `.local-data/uploads/` and is what every `storageKey` across
  `VerificationCase.documentKeys`, `CredentialEvidence`, and
  `CompletionEvidence` now actually points to — files really are uploaded,
  hashed (sha256, computed server-side, not client-supplied) and served
  back. What it does NOT have: durability beyond this one disk, replication,
  virus/malware scanning, or any production-grade storage tier. Swap it for
  an S3-backed implementation of the same `{storageKey, contentHash}`
  interface before any shared deployment.
- **File downloads are authenticated, not authorized.** `GET
  /uploads/:storageKey` requires a valid JWT but does not check that the
  caller is actually a party to the credential, verification case, or
  assignment the file belongs to — any logged-in user who learns a storage
  key (they are UUID-prefixed, so not guessable, but nothing stops a
  legitimate viewer from sharing one) can fetch it. This matches the
  project's existing "no issuer-authorization tier yet" posture elsewhere;
  tighten it together with that work.
- **Uploads are capped at 20MB and a small extension allowlist** (pdf, doc,
  docx, png, jpg, jpeg, txt) — enough to stop obviously wrong files, not a
  substitute for real content-type sniffing or malware scanning.
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
→ not found). `npm install`, `prisma generate`, the TypeScript build, and
the Jest **unit** tests (pure functions with no database:
`maritime-id.spec.ts`, `reputation-calculator.spec.ts`,
`credential-signing.spec.ts`, `chain-anchor.service.spec.ts`,
`audit.service.spec.ts`) ran from the start and their real output is what's
reported in the top-level README.

The database-dependent paths have since actually been run, against a real
(if non-standard) local Postgres — no Docker was ever available in this
sandbox, so `embedded-postgres` (see [scripts/local-db.mjs](../scripts/local-db.mjs))
was used instead of `docker compose up -d db`:

- The Prisma migration and seed script ran and were confirmed idempotent
  (re-running the seed no longer duplicates the demo listing — it upserts
  on a fixed id).
- The **e2e** test (`marketplace-lifecycle.e2e-spec.ts`, the full
  register → verify → publish → apply → award → confirm → points journey)
  ran against that database and passed. Running it surfaced and fixed a
  real bug: `JwtAuthGuard` was only resolvable within `AuthModule`'s own
  scope, which would have broken every protected endpoint outside it in
  production (see `apps/api/src/auth/auth.module.ts`).
- Beyond the automated e2e test, the same journey — plus the admin
  verification-decision endpoint, which the e2e test bypasses with a
  direct Prisma write — was run by hand through the real Next.js UI and
  the real API (register, create org, submit verification, approve it as
  an allowlisted admin, publish a listing, apply from a second
  organization, award, submit evidence, confirm, and check the points
  ledger). Every step produced real data in Postgres; none of it is
  simulated. The first pass through this used `curl` directly against the
  admin API, because there was no admin page yet; the `/admin` page (a
  verification queue with approve/reject/more-info actions) was built
  afterward and re-verified the same way — approve a real pending case,
  confirm the org flips to verified, confirm a non-admin user gets a 403
  with a clear message instead of a crash.
- The credential issue/verify/revoke path got the same live treatment: one
  verified org looked up another user by their public Maritime ID (a new
  endpoint added for this — `GET /credentials/subjects/:maritimeId`),
  issued them a signed credential, and the subject saw it appear on their
  own dashboard. The public verification page confirmed a real Ed25519
  signature check ("Signature: valid (Ed25519)"), not a hardcoded string.
  Revoking the credential through the UI flipped its status to `revoked`
  and the same verification page updated to "✗ Not currently valid" while
  still reporting the signature as intact — confirming revocation is
  tracked as state, not by breaking the signature.
- Reviews and reputation (no new endpoints needed — the data was already
  there, just not surfaced): as the employer on the already-confirmed
  grain-shipment assignment, left the carrier org a real review (4 stars
  + a comment) through the new "Leave a review" form, confirmed the form
  correctly swapped to "you already reviewed" on reload instead of
  allowing a duplicate, and confirmed the review and an honest "not
  enough completed assignments yet (1 so far, 3 needed)" reputation
  message both render on the carrier's public organization page — the
  score-suppression behavior in `reputation-calculator.ts` working
  exactly as designed, not just unit-tested.
- Real file upload/download, end to end, at all three places that take
  evidence: uploaded a real PDF through the "Submit for verification" form
  (a brand-new org), confirmed the exact filename and a working view link
  appear on the admin verification queue, and confirmed `GET
  /uploads/:storageKey` returns the exact bytes with the right
  `Content-Type` (checked by `curl`, headers and body, before touching the
  UI). Did the same for a credential's optional evidence attachment and
  for an assignment's completion evidence — for the latter, computed
  sha256 of the uploaded content locally and confirmed it matched the hash
  the server reported byte-for-byte, proving the content hash is real and
  server-computed, not a client-supplied placeholder like it was before
  this feature existed. Also confirmed the boundary cases: no token → 401,
  a path-traversal attempt in the storage key → 404 (not a crash or a
  leaked file), and a disallowed extension (`.exe`) → a clean 400.

Still not run anywhere: load/concurrency testing, a backup/restore drill,
and anything that would need a live blockchain RPC endpoint (not
configured — see "Known limitations" above). Object storage now has a
real local-disk implementation (see above) but has not been swapped for
an actual cloud object store.
