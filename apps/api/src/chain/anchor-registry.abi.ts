/**
 * ABI for contracts/src/AnchorRegistry.sol. Keep this in sync with the
 * permissionless, append-only contract implementation.
 */
export const ANCHOR_REGISTRY_ABI = [
  "constructor()",
  "function anchorCount() view returns (uint256)",
  "function getAnchor(uint256 index) view returns (bytes32 batchRoot, uint64 eventCount, uint64 timestamp, address anchorSubmitter)",
  "function indexOfRoot(bytes32 batchRoot) view returns (uint256)",
  "function offChainRefAnchored(bytes32) view returns (bool)",
  "function submitAnchor(bytes32 batchRoot, uint64 eventCount, bytes32 offChainRef) returns (uint256 index)",
  "function verifyInclusion(uint256 anchorIndex, string leafHex, string[] proofHex, bool[] siblingIsLeft) view returns (bool)",
  "event AnchorSubmitted(uint256 indexed index, bytes32 indexed batchRoot, bytes32 indexed offChainRef, uint64 eventCount, uint64 timestamp, address submitter)",
  "error EmptyRoot()",
  "error ZeroEventCount()",
  "error ReferenceAlreadyAnchored()",
  "error IndexOutOfRange()",
  "error ProofLengthMismatch()",
  "error InvalidHexLength()",
  "error InvalidHexChar()",
] as const;
