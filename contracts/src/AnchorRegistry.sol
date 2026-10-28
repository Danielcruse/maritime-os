// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AnchorRegistry
/// @notice Append-only, on-chain registry of Merkle roots anchoring batches of
/// Maritime OS audit events. The contract never sees event content — only a
/// batch's Merkle root, how many leaves it covers, and an off-chain reference
/// id (the Postgres ChainAnchor row's UUID) so on-chain and off-chain records
/// can be cross-referenced without an indexer.
/// @dev Single authorized submitter (the API's signing key) for this MVP —
/// not a multi-sig or DAO-governed submitter set. See
/// docs/architecture.md "Known limitations" before trusting this beyond a
/// local development chain.
contract AnchorRegistry {
    struct Anchor {
        bytes32 batchRoot;
        uint64 eventCount;
        uint64 timestamp;
        address submitter;
    }

    address public owner;
    address public submitter;
    Anchor[] private anchors;

    // 1-based so 0 reliably means "not found" from the zero value of a Solidity mapping.
    mapping(bytes32 => uint256) private rootToIndexPlusOne;
    mapping(bytes32 => bool) public offChainRefAnchored;

    event AnchorSubmitted(
        uint256 indexed index,
        bytes32 indexed batchRoot,
        bytes32 indexed offChainRef,
        uint64 eventCount,
        uint64 timestamp,
        address submitter
    );
    event SubmitterUpdated(address indexed previousSubmitter, address indexed newSubmitter);

    error NotOwner();
    error NotSubmitter();
    error EmptyRoot();
    error ZeroEventCount();
    error ReferenceAlreadyAnchored();
    error IndexOutOfRange();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlySubmitter() {
        if (msg.sender != submitter) revert NotSubmitter();
        _;
    }

    constructor(address initialSubmitter) {
        owner = msg.sender;
        submitter = initialSubmitter == address(0) ? msg.sender : initialSubmitter;
    }

    /// @notice Rotate the authorized submitter (e.g. the API's signing key is rotated).
    function setSubmitter(address newSubmitter) external onlyOwner {
        emit SubmitterUpdated(submitter, newSubmitter);
        submitter = newSubmitter;
    }

    /// @param batchRoot Deterministic Merkle root computed off-chain over sorted leaf hashes.
    /// @param eventCount Number of audit events folded into this root (informational, not verified on-chain).
    /// @param offChainRef The off-chain ChainAnchor row's UUID, packed into bytes32, so a reader
    /// can look up the matching Postgres row directly from the emitted event.
    function submitAnchor(bytes32 batchRoot, uint64 eventCount, bytes32 offChainRef)
        external
        onlySubmitter
        returns (uint256 index)
    {
        if (batchRoot == bytes32(0)) revert EmptyRoot();
        if (eventCount == 0) revert ZeroEventCount();
        if (offChainRefAnchored[offChainRef]) revert ReferenceAlreadyAnchored();

        index = anchors.length;
        anchors.push(
            Anchor({
                batchRoot: batchRoot,
                eventCount: eventCount,
                timestamp: uint64(block.timestamp),
                submitter: msg.sender
            })
        );
        rootToIndexPlusOne[batchRoot] = index + 1;
        offChainRefAnchored[offChainRef] = true;

        emit AnchorSubmitted(index, batchRoot, offChainRef, eventCount, uint64(block.timestamp), msg.sender);
    }

    function anchorCount() external view returns (uint256) {
        return anchors.length;
    }

    function getAnchor(uint256 index)
        external
        view
        returns (bytes32 batchRoot, uint64 eventCount, uint64 timestamp, address anchorSubmitter)
    {
        if (index >= anchors.length) revert IndexOutOfRange();
        Anchor storage a = anchors[index];
        return (a.batchRoot, a.eventCount, a.timestamp, a.submitter);
    }

    /// @notice Returns 0 if the root was never anchored; otherwise the 1-based index (subtract 1 for the array position).
    function indexOfRoot(bytes32 batchRoot) external view returns (uint256) {
        return rootToIndexPlusOne[batchRoot];
    }
}
