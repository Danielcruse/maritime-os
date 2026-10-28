# Maritime OS

Maritime marketplace, identity (Maritime ID), verifiable credentials and
trust/points platform. This is the first vertical slice of the MVP
described in the founder's brief: **register → verify a business → publish
a freight listing → apply → award → submit completion evidence → confirm
→ points + reputation update → auditable history.** See
[docs/architecture.md](docs/architecture.md) for design notes and, more
importantly, **known limitations** — read that before assuming anything
here is production-ready.

## What's implemented

| Area | Status |
| --- | --- |
| Project foundation, monorepo, Prisma schema | Implemented |
| Auth (register/login/refresh/logout), Maritime ID | Implemented |
| Organizations, membership, verification workflow | Implemented |
| Credentials (issue/verify/revoke, Ed25519-signed) | Implemented, no issuer-authorization tier yet |
| Marketplace: listings, applications, awards | Implemented |
| Assignments: evidence, confirm, open + **resolve** disputes | Implemented |
| Reviews | Implemented |
| Reputation (versioned, evidence-based calculation) | Implemented |
| Points ledger (idempotent, reversible) | Implemented |
| Audit trail (hash-chained, tamper-evident) | Implemented |
| Blockchain anchoring | Implemented against a **local dev chain only** — real contract, real signed transactions, no public testnet/mainnet (see known limitations) |
| Object storage / file upload | Implemented on **local disk only** — `POST /uploads` + `GET /uploads/:storageKey`, no S3/cloud storage wired up (see known limitations) |
| Frontend | Implemented — register/login, dashboard, org management + verification (with real document upload), listing create/publish/apply/award, assignment evidence/confirm/dispute/review (with real evidence file upload), admin verification queue (with document view links), dispute-resolution queue, and a manual chain-anchor trigger, credential issue/revoke + evidence upload + a public verification page, reputation score + reviews on the org page, and a public chain-anchor page that independently recomputes and checks the Merkle root in the browser. Styling is minimal |
| Security hardening, load testing, backup drills | **Not done** |

Nothing above is a demo pretending to work — every "Implemented" row has
working service code and a real passing unit test where the logic doesn't
need a database (see "Test results" below). The database-dependent paths
(migrations, seed, the full e2e lifecycle test) **have** been run, against
a real local Postgres — see
[docs/architecture.md § What has and hasn't run](docs/architecture.md#what-has-and-hasnt-run)
for exactly what, including a full register → award → confirm → points
run through the actual UI, not just the automated test.

## Requirements

- Node.js ≥ 20
- Docker (for Postgres + Redis locally) — or any reachable Postgres 16 and Redis 7
- `npm`

## Setup

```bash
npm install
cp .env.example .env
# fill in JWT_ACCESS_SECRET / JWT_REFRESH_SECRET, e.g.:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start Postgres (pick one):

```bash
# Option A — Docker (preferred if you have it)
docker compose up -d

# Option B — no Docker available: a local, file-backed Postgres cluster
# via the `embedded-postgres` dev dependency (no system install, no admin
# rights). This is what was actually used to verify this project end to
# end, since the sandbox it was built in had neither Docker nor a local
# Postgres service. Leave it running in its own terminal.
node scripts/local-db.mjs
```

Either way, make sure `DATABASE_URL` in `.env` points at it — Option B uses
`postgresql://maritime:maritime_dev_pw@localhost:5432/maritime_os`.
Redis is only needed once a background job queue is actually wired up
(not yet, in this MVP) — skip it for local runs.

Apply the schema and seed demo data:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Blockchain anchoring is optional but real when configured — see
[Blockchain anchoring (local)](#blockchain-anchoring-local) below. Without
it, `CHAIN_*` vars stay empty and anchoring silently falls back to a
local-only `pending` row (unchanged from before this existed).

Run the API:

```bash
npm run dev:api
```

API docs (Swagger/OpenAPI): http://localhost:3001/api/docs
Health check: http://localhost:3001/api/v1/health

Run the web app (separate terminal):

```bash
npm run dev:web
```

Open http://localhost:3000.

## Tests

```bash
npm run test:unit -w apps/api   # pure logic, no DB — safe to run anywhere
npm run test:e2e -w apps/api    # full lifecycle — needs DATABASE_URL + migrations applied
```

## Test results (actually executed, in the sandbox this was built in)

See [docs/architecture.md § What has and hasn't run](docs/architecture.md#what-has-and-hasnt-run)
for the exact commands and their real output — not restated here so there's
one place this can go stale instead of two.

## Repository layout

```
apps/api/        NestJS API — one module per domain
apps/web/        Next.js frontend (minimal)
database/prisma/ schema.prisma — the data model
database/seeds/  seed script
contracts/       Foundry project — AnchorRegistry.sol + tests + deploy script
docs/            architecture notes, known limitations
```

## Blockchain anchoring (local)

Anchoring batches of audit events requires an EVM chain, a deployed
`AnchorRegistry` contract, and a signer. This sandbox has no access to a
funded account on any public testnet, so it uses
[Foundry](https://getfoundry.sh)'s `anvil` — a real local chain, not a
mock. Requires `forge` and `anvil` on `PATH` (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

```bash
# Terminal 1 — leave running
anvil --port 8545

# Terminal 2 — install deps (first time only) and deploy
cd contracts
forge install   # fetches forge-std; contracts/lib is gitignored
forge build
forge test

CHAIN_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:DeployAnchorRegistry \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

The private key above is `anvil`'s well-known, publicly documented
first dev account — safe to hardcode here because it only ever holds
play-money ETH on a throwaway local chain. **Never reuse it, or any other
`anvil` default key, on a network where it could hold anything real.**

Copy the deployed address from the script's output into `.env`:

```bash
CHAIN_RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CHAIN_ANCHOR_CONTRACT_ADDRESS=<address from the deploy output>
CHAIN_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Restart the API, then as an admin user (`ADMIN_USER_IDS`), either call
`POST /api/v1/admin/chain/anchor` or click **"Anchor pending events now"**
on `/admin`. Check the result at `/chain/anchors/:id` — that page
recomputes the Merkle root client-side from the public event-hash list
and checks it against the anchored root, so it isn't just trusting the
API's word for it. You can also check the chain directly:

```bash
cast call <contract address> "anchorCount()(uint256)" --rpc-url http://127.0.0.1:8545
```

## Credential signing keys (for local dev only)

```bash
node -e "
const ed = require('@noble/ed25519');
const { sha512 } = require('@noble/hashes/sha512');
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
(async () => {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKeyAsync(priv);
  console.log('CREDENTIAL_SIGNING_PRIVATE_KEY=' + Buffer.from(priv).toString('hex'));
  console.log('CREDENTIAL_SIGNING_PUBLIC_KEY=' + Buffer.from(pub).toString('hex'));
})();
"
```

Paste both lines into `.env`. Rotate before any real deployment — this
generates a fresh keypair every time it's run, which is the point.
