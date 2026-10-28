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
- **Chain anchoring is real, but only against a local dev chain — not a
  public network.** `contracts/src/AnchorRegistry.sol` is a real Solidity
  contract (Foundry project, 17 passing tests), deployed to a local
  `anvil` node; `ChainAnchorService.submitBatch` signs and broadcasts a
  real transaction via `ethers` and stores the real `txHash`, not a
  placeholder. Confirmation is decoupled from submission on purpose —
  `submitBatch` only blocks briefly (5s) trying for an immediate
  confirmation, then leaves the anchor `pending` with its real `txHash`
  if that doesn't land in time, since blocking an HTTP request on a
  chain's actual block time (12s+ on Ethereum mainnet, longer under
  congestion) is the wrong shape for a synchronous API call.
  `reconcilePending` (run opportunistically on every read, and
  explicitly via `POST /admin/chain/reconcile`) checks pending anchors'
  transactions against the chain and flips them to `confirmed` or
  `failed` once mined. What's still missing before this means anything
  beyond a demo: (1) no public testnet or mainnet has been selected or
  funded — this sandbox has no access to a funded account on one; (2)
  single-submitter trust model — `AnchorRegistry` has one authorized
  `submitter` address (the API's signing key), not a multi-sig or
  DAO-governed set, so anyone who steals that key can submit false
  anchors (they can't rewrite history, since a wrong root just fails
  independent recomputation, but they could submit garbage); (3) the
  local chain is ephemeral — `anvil`'s state is gone the moment it
  restarts, so every anchor's on-chain existence is only as durable as
  that one process. Swap `CHAIN_RPC_URL` for a real network's endpoint,
  fund a real signer, and address all three before trusting an anchor as
  evidence of anything.
- **A real scheduler now exists** (`ChainSchedulerService`, a plain
  `setInterval` lifecycle hook — no job queue, since none is wired up
  anywhere else in this MVP) — every `CHAIN_SCHEDULER_INTERVAL_SECONDS`
  (default 120, `0` disables it), it anchors any unanchored audit
  events, reconciles any pending anchors, and checks confirmed ones for
  reorgs, with no human needing to click anything. `POST
  /admin/chain/anchor|reconcile|detect-reorgs` and their `/admin` buttons
  still exist for an immediate, on-demand run. This closes what used to
  be two separate "manually triggerable, not scheduled" gaps.
- **Reorg detection** (`ChainAnchorService.detectReorgs`) — records each
  anchor's block HASH, not just its number, at confirmation time, then
  compares that hash to what the chain currently reports for that block
  number; divergence means the block was orphaned, and the anchor gets
  flagged `reorg_affected` instead of silently staying `confirmed`. It
  only covers anchors confirmed AFTER this field was added; anchors
  confirmed earlier have no recorded block hash to compare against and
  are correctly skipped, not guessed at. It does not attempt recovery
  (resubmitting an orphaned anchor's transaction) — that's a deliberate
  next step, not done here.
- **Per-event Merkle inclusion proofs are real, including on-chain
  verification — but only for anchors submitted after `AnchorRegistry`
  gained `verifyInclusion`.** `GET /chain/anchors/:id/proof/:eventId`
  (`apps/api/src/chain/merkle.ts`) returns a compact O(log n) proof for
  one event, not the whole batch, checked off-chain (recomputed from
  scratch, not trusted) and on-chain (a free `eth_call` against the
  contract). Anchors submitted to an OLDER deployment of the contract —
  i.e. before `verifyInclusion` existed — correctly return
  `onChainVerified: null`, not an error: that function genuinely does not
  exist in that contract's deployed bytecode, which is expected
  immutability, not a bug. This is also why on-chain verification is
  looked up by the anchor's OWN stored `contractAddress`, never the
  currently-configured one — an anchor must stay checkable against the
  exact contract it was actually submitted to, independent of any later
  redeploy.
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
- Dispute resolution, which previously had no implementation at all — a
  dispute could be opened but never closed, leaving the assignment stuck
  in `disputed` forever. Added `AssignmentsService.resolveDispute` plus an
  admin disputes queue, then exercised both outcomes live: opened a real
  dispute as the carrier, resolved it `resolved_for_counterparty` through
  the admin UI and confirmed the assignment genuinely un-froze back to
  `active` (not just the dispute row changing), then opened a second
  dispute and resolved it `resolved_for_opener` and confirmed the
  assignment moved to `cancelled` instead. The business rule mapping
  resolution outcome to assignment status is a first-pass default
  documented in `AssignmentsService.resolveDispute`'s docstring, not
  something pulled from the founder's brief — validate it before trusting
  it on a real dispute.

- Blockchain anchoring, run against a real (if local-only) chain, not
  mocked: `forge test` — 11 tests covering access control (owner/submitter
  roles), duplicate-reference rejection, zero-root/zero-count rejection,
  index-out-of-range, and correct event emission — all passed. Then live,
  end to end, through the actual running system: started `anvil`,
  deployed `AnchorRegistry` with `forge script --broadcast` (a real
  transaction, not a simulation), pointed the API at it, and clicked
  "Anchor pending events now" on `/admin`. That submitted a real signed
  transaction anchoring 135 real audit events accumulated from everything
  else tested in this project; it confirmed in the next block with a real
  `txHash`. Verified the result three independent ways, not just by
  reading the API's own response back: (1) recomputed the Merkle root
  from the public per-event hash list in a plain Node script — matched
  the DB's `batchRoot` exactly; (2) called `cast call ... getAnchor(0)`
  directly against the contract, bypassing the API entirely — the
  on-chain root, event count, and submitter address all matched; (3) the
  `/chain/anchors/:id` page's own client-side recomputation (Web Crypto,
  not a call back to the server) also matched. Repeated the whole cycle a
  second time with one fresh event to confirm it isn't a one-off, and
  confirmed clicking the button with nothing new pending returns a clean
  400 instead of silently resubmitting. Also found and fixed a real bug
  this surfaced: Prisma's `BigInt` (`ChainAnchor.blockNumber`) doesn't
  survive `JSON.stringify` by default — every anchor endpoint 500'd until
  `main.ts` got a `BigInt.prototype.toJSON` patch — and a second one: the
  original `audit/anchors/:id` route collided with
  `AuditController`'s `audit/:entityType/:id` wildcard (`entityType` could
  literally be `"anchors"`), which silently shadowed both new endpoints
  until the chain routes were moved to `chain/anchors/:id`.
- The pending/reconcile split specifically: used `cast rpc evm_setAutomine
  false` to make `anvil` stop mining, so a submitted transaction would
  genuinely sit unconfirmed — not a simulation. Anchoring with the chain
  in that state returned in ~5.2s (the bounded immediate-confirm attempt
  timing out as designed) with `status: "pending"` and a real `txHash` but
  `blockNumber: null`. Mined the block by hand (`cast rpc evm_mine`),
  called `POST /admin/chain/reconcile`, and confirmed it reported
  `{checked: 1, confirmed: 1, failed: 0}` and the anchor flipped to
  `confirmed` with a real block number. This proves the API never hangs
  waiting on a slow chain and that a pending anchor genuinely does get
  picked up later, not just that the code compiles.
- The audit trail was previously built (hash-chained `AuditEvent` rows)
  but had no frontend anywhere — a real gap given "auditable history" is
  the last step of this project's own one-line mission statement. Added
  `/audit/[entityType]/[entityId]`, linked from the assignment and
  organization pages, and confirmed live: an assignment's three events
  (`awarded` → `evidence_submitted` → `confirmed`) each show the right
  `previousHash`, each one matching the prior event's own hash exactly
  (not just present — checked they're the same value), and each correctly
  links to the anchor that actually covers it.
- Per-event Merkle inclusion proofs, cross-checked four independent ways.
  `forge test` validated the Solidity port against test vectors generated
  by the REAL TypeScript implementation (not hand-computed), including an
  odd-count batch to exercise self-duplication — 17/17 pass. Live:
  redeployed the contract with `verifyInclusion`, anchored a fresh
  25-event batch, and fetched a proof for one event buried in it — a
  5-hash proof, not all 25. Checked it four ways: (1) the API's own
  off-chain recomputation said it matched; (2) the live contract's
  `verifyInclusion`, called through the API, said `true`; (3) called the
  exact same function directly with `cast call`, bypassing the API
  entirely — `true`; (4) called it again with a deliberately wrong leaf
  hash — `false`, proving the contract actually discriminates rather than
  rubber-stamping. Also confirmed the "predates this function" case isn't
  silently wrong: asking for a proof against an anchor on the OLD
  (pre-`verifyInclusion`) contract deployment correctly returned
  `onChainVerified: null` with a clear "predates on-chain proof
  verification" message in the UI, not a crash or a false positive.
  Finally drove the whole thing through the real browser: clicked "Verify
  this event's inclusion" on `/audit/user/:id` and watched both checks
  render live.
- Reorg detection, against a genuinely reorganized chain, not a
  simulation of one: snapshotted `anvil`'s state (`evm_snapshot`),
  anchored a fresh batch (confirmed in block 8, with a real block hash
  recorded), then reverted to the snapshot (`evm_revert`) — undoing
  block 8 and everything after it — and mined two different empty
  blocks in its place. Block 8 now exists with entirely different
  content and a different hash than what was recorded; the original
  anchor's transaction no longer exists on the canonical chain. Ran
  `POST /admin/chain/detect-reorgs` and confirmed it correctly reported
  `{checked: 1, reorgAffected: 1}` and flipped that anchor's status to
  `reorg_affected` — checked directly against the database afterward,
  not just trusting the endpoint's own response. Also confirmed the
  honest-exclusion behavior: anchors confirmed before this field existed
  (no recorded block hash) are correctly skipped rather than guessed at,
  and running the check again afterward correctly reported 0 anchors
  left to check, since the only one with a tracked block hash had
  already been flagged.
- The scheduler, watched actually fire on its own — not just read as
  code and trusted. Set `CHAIN_SCHEDULER_INTERVAL_SECONDS=20`, restarted
  the API, confirmed its startup log ("Chain scheduler running every
  20s"), registered a user, and confirmed via the audit-trail endpoint
  that the resulting event's `chainAnchorId` was `null` — before the
  scheduler had a chance to run. Polled without ever calling any
  anchor/admin endpoint myself; the event came back anchored on its own.
  Registered a second user and watched the server log print a SECOND
  independent "Auto-anchored" line 80 seconds (four full intervals)
  after the first, proving it's genuinely recurring, not a one-shot
  startup task. Restarted the API with the env var unset afterward and
  confirmed it falls back to the documented 120s default. Left it
  running at that default for the rest of this session — by the time
  work resumed after a break, `anvil`'s block number had kept climbing
  on its own with no one anchoring by hand.

Still not run anywhere: load/concurrency testing, a backup/restore drill,
and anchoring against anything other than this local `anvil` chain.
Object storage now has a real local-disk implementation (see above) but
has not been swapped for an actual cloud object store.
