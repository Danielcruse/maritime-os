# Maritime OS protocol governance

This project is intentionally split into two layers:

1. A permissionless on-chain anchor registry that records Merkle roots and lets anyone verify inclusion.
2. An off-chain application layer that decides who is verified, who may issue credentials, how disputes resolve, and what marketplace reputation means.

Those are not the same thing. An anchor proves that a batch of event hashes existed at a point in time; it does not prove the business truth of the underlying event.

## Governance model for the next phase

The next milestone is not to add a single admin backdoor. The next milestone is to define a multi-party protocol for the decisions the chain itself cannot judge.

### 1. Issuer authorization

- Separate `verified organization` from `authorized issuer`.
- Maintain a public issuer registry with rules for who may issue which credential types.
- Require challenge and revocation procedures for bad issuers.
- Keep personal identity and evidence off-chain, with only cryptographic references and status on-chain.

### 2. Dispute resolution

- Build a transparent dispute model with independent reviewers or juries.
- Make decisions challengeable with a defined appeal path.
- Record dispute reason codes, evidence hashes, and final decisions in an auditable log.
- A final decision must update reputation and points according to published rules.

### 3. Reputation and points

- Reputation should be calculated from evidence such as confirmed work, timeliness, ratings, and dispute outcomes.
- Points should remain a closed-loop marketplace reward until the product and legal model are validated.
- Do not make points transferable or tradable without explicit governance review and legal analysis.

### 4. Permissionless anchor registry

The chain should continue to be a permissionless integrity layer:

- any account may submit an anchor,
- proofs are independently verifiable,
- no owner or admin has privileged rights,
- contract upgrades are explicitly out of scope unless a later protocol version establishes a governance mechanism.

This is the correct role for the current anchor contract: integrity, not authority.

## Deployment checklist

Before a public testnet pilot:

- deploy a fresh contract and record chain ID and address,
- publish source and verification procedures,
- validate the RPC network identity matches the configured chain ID,
- run multiple independent indexers and clients,
- test proof verification without the Maritime OS API,
- require a security review before expanding to production or token-like utility.

## Required next work

The system should not claim “decentralized” status until it has:

- a defined governance process,
- a challengeable dispute process,
- an issuer authorization model,
- chain config integrity checks,
- external operator validation on a testnet,
- and a documented protocol boundary between off-chain authority and on-chain proof.

At that point, the project can honestly call itself a decentralized maritime protocol rather than a centralized app with a local anchor layer.
