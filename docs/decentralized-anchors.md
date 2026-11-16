# Decentralized anchor protocol: implementation status

## Scope

The current Solidity component is an **immutable, permissionless audit-anchor registry**, not a full marketplace, identity, governance, or settlement blockchain. It records Merkle roots and exposes inclusion verification. Roots prove that a commitment was recorded; they do not prove that the off-chain claim is true.

## Decentralized anchor behavior

- `AnchorRegistry` has no owner, privileged submitter, admin operation, or upgrade hook.
- Any account may submit an anchor and pays its own transaction fee.
- The contract is append-only. A reference can be anchored only once.
- Anyone can read anchor metadata and verify a Merkle inclusion proof.
- Hash inputs for inclusion verification must be exactly 64 lowercase hexadecimal characters.
- A contract redeployment is a new registry; old anchors remain at their original immutable address.

This removes centralized control over **anchor submission**, but does not decentralize the API, database, credential issuer decisions, dispute resolution, or reputation calculation. Those are still application-level services and require separate protocol work.

## Independent verification and data availability

The root alone is not enough to reconstruct an event batch. Operators should publish and preserve the event hashes and inclusion proofs through a durable, independently accessible data layer. Verify by checking the root and proof directly against the deployed contract; do not treat an API's `offChainMatches` response as authoritative.

The contract intentionally stores no personal data or raw event payload. Avoid putting personally identifying or commercially sensitive information on-chain, including in event references.

## Deployment requirements

1. Deploy to a selected public test network first; the existing Anvil chain is ephemeral and development-only.
2. Use a unique deployment key only to pay deployment gas. It has no authority after deployment.
3. Record and publish the network chain ID, contract address, deployment transaction, source commit, and verified source code.
4. Check the RPC network identity before submitting or verifying anchors.
5. Operate multiple independent clients/indexers and test proof verification without relying on the Maritime OS API.
6. Obtain an independent smart-contract and protocol review before production use.

## Limits and next governance work

A permissionless anchor registry deliberately does not decide which organization is verified, who may issue credentials, whether a shipment completed, how disputes resolve, or how reputation is calculated. These require explicit, federated governance and appeal rules. Do not silently add an owner/admin backdoor to this contract; introduce any future governance in a separately specified and independently reviewed protocol version.
