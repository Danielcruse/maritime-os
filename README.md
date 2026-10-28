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
| Blockchain anchoring | **Stub only** — no network selected, no contract deployed |
| Object storage / file upload | Implemented on **local disk only** — `POST /uploads` + `GET /uploads/:storageKey`, no S3/cloud storage wired up (see known limitations) |
| Frontend | Implemented — register/login, dashboard, org management + verification (with real document upload), listing create/publish/apply/award, assignment evidence/confirm/dispute/review (with real evidence file upload), admin verification queue (with document view links) and dispute-resolution queue, credential issue/revoke + evidence upload + a public verification page, reputation score + reviews on the org page. Styling is minimal |
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
contracts/       reserved for Solidity (not started)
docs/            architecture notes, known limitations
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
