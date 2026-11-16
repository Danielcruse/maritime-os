# Reputation tiers and transactional token economy

## 1. Reputation tiers

The reputation model should use a small, understandable four-tier ladder instead of a floating score that users do not interpret.

- Bronze: 0–39
  - new or low-signal participants
  - minimum sample size still enforced before tier is shown
- Silver: 40–69
  - reliable but not proven at scale
- Gold: 70–89
  - trusted execution history and strong delivery record
- Platinum: 90–100
  - elite track record, minimal disputes, verified reputation signals

These bands should be derived from the same score used by `calculateReputation`, so the tier is deterministic and auditable.

The platform should expose the tier alongside the score in the UI and API response, but the underlying score remains the source of truth.

## 2. Transactional token design

The project should not treat points as a speculative token. It should be a bounded transactional utility layer that is created only when value is delivered and consumed when value is reversed or disputed.

Recommended model:

- value is measured in a “work credit” or “transaction token” unit derived from completed assignments and verified evidence
- token mint occurs only on successful completion of a service outcome, such as a confirmed assignment or a verified credential that drives workflow value
- token burn occurs on dispute reversal, cancellation, or fulfillment failure
- token balances are recalculated from an append-only ledger, not from a cached value alone

This aligns with the current `PointsService` ledger pattern in the project:

- mint on completion: `PointsService.award(...)`
- reversal on dispute/cancel: `PointsService.reverse(...)`
- reconciliation from ledger totals: `PointsService.reconcileBalance(...)`

## 3. Integration with Maritime OS

Recommended integration rules:

- Use the current `PointsService` as the transactional token ledger and keep the points model versioned with `POINTS_RULES_VERSION`.
- Use `calculateReputation` and `getReputationTier` as the public reputation layer.
- Gate higher-tier access or marketplace privileges based on reputation tier, not just raw score.
- Require a minimum sample size before revealing a tier badge to keep low-volume, lucky performers from gaming the interface.
- Require dispute and reversal events to reduce both tier and token balances, so the system remains economically honest.

## 4. Governance rules

- The tier thresholds are part of the protocol and should be versioned together with the scoring rule.
- Any change to scoring or token weighting must be a published version change, not an in-place silent rewrite.
- Dispute outcomes must update both reputation and points in the same transaction or in a tightly coupled transaction sequence.
- Do not make transactional tokens transferable or sellable until legal review and governance approval are complete.

## 5. Implementation direction

The project already has the right primitives:

- `apps/api/src/reputation/reputation-calculator.ts` for deterministic score calculation
- `apps/api/src/points/points.service.ts` for append-only token ledger behavior
- `apps/api/src/assignments/assignments.service.ts` for completion and dispute events

The next step is to attach the reputation tier explicitly to the score output and enforce the value-token mint/reversal rules in the completion/dispute flows.

This produces a system that is understandable to users and auditable to regulators:

- score = measured outcome
- tier = human-readable interpretation
- token = utility credit created from delivered value

