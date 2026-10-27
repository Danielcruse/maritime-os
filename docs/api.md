# API reference

The generated OpenAPI contract is the source of truth, not this file:
start the API (`npm run dev:api`) and open **http://localhost:3001/api/docs**.

Every response body is either `{ "data": ... }` or `{ "error": { "code", "message", "requestId" } }`
(`apps/api/src/common/filters/http-exception.filter.ts`) — never a raw stack
trace or database error.

## Endpoint groups implemented

- `POST/GET /api/v1/auth/*` — register, login, refresh, logout
- `GET/PATCH /api/v1/me` — own profile; `GET /api/v1/me/points` — points ledger
- `POST/GET /api/v1/organizations/*` — create, read, submit verification
- `POST /api/v1/admin/verification-cases/:id/decision` — admin-only
- `POST/GET /api/v1/credentials/*`, `/organizations/:id/credentials` — issue, verify, revoke
- `GET/POST /api/v1/listings/*` — search, create, publish, cancel
- `POST/GET /api/v1/listings/:id/applications/*` — apply, list, withdraw
- `POST /api/v1/listings/:listingId/applications/:applicationId/award/organizations/:organizationId`
- `GET /api/v1/assignments/:id`, `/evidence/*`, `/confirm/*`, `/disputes`
- `POST/GET /api/v1/assignments/:id/reviews/*`, `/organizations/:id/reviews`
- `GET /api/v1/organizations/:id/reputation`
- `GET /api/v1/audit/:entityType/:id`, `/audit/anchors/:id`

Routes that act "on behalf of an organization" encode the organization id in
the path (`.../organizations/:organizationId`) rather than trusting it from
the request body — `OrgMembershipGuard` re-derives membership from the
database on every call. See `docs/architecture.md` for why this is a path
param rather than a header or body field in this MVP.
