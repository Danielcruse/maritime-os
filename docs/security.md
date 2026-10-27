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
- No file upload endpoint exists yet, so there is nothing here to validate
  MIME type, size, or malware status — `storageKey` fields are trusted
  opaque strings. Do not wire a real upload flow to this API without adding
  that validation first.
- Secrets: `.env.example` lists every secret this app needs; none has a
  default value baked into code. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
  and the credential signing keypair must be generated per-environment
  (commands in the root README) and never committed.
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
