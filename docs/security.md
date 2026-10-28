# Security notes

This is a first vertical slice, not a security-reviewed release. See
`docs/architecture.md` → "Known limitations" for the full list; the items
with direct security consequence are repeated here so they aren't missed:

- `AdminGuard` is an environment-variable allowlist of user IDs, not a real
  role table. Anyone who can set `ADMIN_USER_IDS` on the deployment
  controls every admin endpoint. Replace before any shared deployment.
- No separate "authorized credential issuer" tier — any verified
  organization can issue a credential to any user. Do not treat an issued
  credential as meaning more than "a verified org on this platform typed
  this in," until that gap is closed.
- File upload (`POST /uploads`) checks only extension (a small allowlist)
  and a 20MB size cap — it does not sniff real content type or scan for
  malware. `GET /uploads/:storageKey` requires login but not that the
  caller is actually a party to whatever the file is evidence for; storage
  keys are UUID-prefixed (unguessable) but that is not real authorization.
  Storage itself is local disk (see `docs/architecture.md`), with none of
  an object store's durability or access-tiering. Harden all three before
  any shared deployment.
- Secrets: `.env.example` lists every secret this app needs; none has a
  default value baked into code. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
  and the credential signing keypair must be generated per-environment
  (commands in the root README) and never committed.
- `CHAIN_SIGNER_PRIVATE_KEY` in local dev is `anvil`'s well-known, publicly
  documented first dev-account key — intentionally, since it only ever
  signs transactions on a throwaway local chain with play-money ETH. It is
  committed to the README as a known, public value. **Generate and fund a
  real signer before pointing `CHAIN_RPC_URL` at any network that isn't a
  local `anvil` instance** — reusing this key anywhere real would let
  anyone submit anchor transactions as "you." `AnchorRegistry.sol` also
  trusts a single `submitter` address with no multi-sig or governance;
  see `docs/architecture.md` "Known limitations" for the full list of
  gaps before this means anything as evidence.
- `POST /admin/chain/anchor` is admin-gated (same `AdminGuard` allowlist
  caveat above) but has no rate limit of its own beyond the global
  default, and batches up to 500 events per call — on a real network with
  gas costs, an attacker who gained admin access could run up real
  transaction fees by spamming it.
- Rate limiting is a single global default (`ThrottlerModule`, 120 req/min)
  plus a tighter limit on `/auth/register` and `/auth/login`. Not tuned,
  not reviewed against realistic abuse patterns.
- Dependency/secret scanning, a WAF, and a formal threat model are not set
  up. `npm audit` was run once during setup and reported vulnerabilities in
  transitive dependencies that have not been triaged — run `npm audit`
  yourself before deploying and address what's load-bearing.
- No backup/restore procedure exists yet because no environment has a
  database to back up. This is a release blocker per the blueprint's own
  acceptance gates (§11.6) — do not pilot without one.
