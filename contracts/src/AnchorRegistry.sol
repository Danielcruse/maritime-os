// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AnchorRegistry
/// @notice Permissionless, append-only registry of Merkle roots for Maritime OS
/// audit batches. No owner, privileged submitter, upgrade hook, or governance
/// key exists: any account may publish an anchor and anyone may verify it.
/// @dev Anchors prove that a root was recorded, not that the off-chain events
/// are true. Event data and proofs must remain independently available off-chain.
contract AnchorRegistry {
    struct Anchor {
        bytes32 batchRoot;
        uint64 eventCount;
        uint64 timestamp;
        address submitter;
    }

    Anchor[] private anchors;
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

    error EmptyRoot();
    error ZeroEventCount();
    error ReferenceAlreadyAnchored();
    error IndexOutOfRange();
    error ProofLengthMismatch();
    error InvalidHexLength();
    error InvalidHexChar();

    /// @notice Publishes a Merkle root. Authorization is intentionally
    /// permissionless; the caller pays the network transaction fee.
    /// @param batchRoot Merkle root computed over sorted event hashes.
    /// @param eventCount Number of event hashes in the batch (informational).
    /// @param offChainRef UUID/reference for independently finding the batch.
    function submitAnchor(bytes32 batchRoot, uint64 eventCount, bytes32 offChainRef)
        external
        returns (uint256 index)
    {
        if (batchRoot == bytes32(0)) revert EmptyRoot();
        if (eventCount == 0) revert ZeroEventCount();
        if (offChainRefAnchored[offChainRef]) revert ReferenceAlreadyAnchored();

        index = anchors.length;
        anchors.push(Anchor({
            batchRoot: batchRoot,
            eventCount: eventCount,
            timestamp: uint64(block.timestamp),
            submitter: msg.sender
        }));
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

    /// @notice Returns 0 if the root was never anchored; otherwise index + 1.
    function indexOfRoot(bytes32 batchRoot) external view returns (uint256) {
        return rootToIndexPlusOne[batchRoot];
    }

    /// @notice Verifies a leaf and compact Merkle proof against an anchor root.
    /// Hashing mirrors apps/api/src/chain/merkle.ts: SHA-256 over concatenated
    /// lowercase 64-character hex strings, not raw bytes.
    function verifyInclusion(
        uint256 anchorIndex,
        string calldata leafHex,
        string[] calldata proofHex,
        bool[] calldata siblingIsLeft
    ) external view returns (bool) {
        if (anchorIndex >= anchors.length) revert IndexOutOfRange();
        if (proofHex.length != siblingIsLeft.length) revert ProofLengthMismatch();
        _validateHashHex(leafHex);

        bytes memory current = bytes(leafHex);
        for (uint256 i = 0; i < proofHex.length; i++) {
            _validateHashHex(proofHex[i]);
            bytes memory sibling = bytes(proofHex[i]);
            bytes memory combined = siblingIsLeft[i] ? bytes.concat(sibling, current) : bytes.concat(current, sibling);
            current = bytes(_toHexString(sha256(combined)));
        }

        return _hexStringToBytes32(string(current)) == anchors[anchorIndex].batchRoot;
    }

    function _validateHashHex(string calldata value) private pure {
        bytes calldata data = bytes(value);
        if (data.length != 64) revert InvalidHexLength();
        for (uint256 i = 0; i < data.length; i++) {
            uint8 c = uint8(data[i]);
            if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) revert InvalidHexChar();
        }
    }

    function _toHexString(bytes32 data) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            str[i * 2] = alphabet[uint8(data[i] >> 4)];
            str[i * 2 + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _hexCharToNibble(bytes1 c) private pure returns (uint8) {
        uint8 b = uint8(c);
        if (b >= 48 && b <= 57) return b - 48;
        if (b >= 97 && b <= 102) return b - 87;
        revert InvalidHexChar();
    }

    function _hexStringToBytes32(string memory hexStr) private pure returns (bytes32 result) {
        bytes memory b = bytes(hexStr);
        if (b.length != 64) revert InvalidHexLength();
        for (uint256 i = 0; i < 32; i++) {
            uint8 hi = _hexCharToNibble(b[i * 2]);
            uint8 lo = _hexCharToNibble(b[i * 2 + 1]);
            result |= bytes32(uint256(hi * 16 + lo)) << uint256((31 - i) * 8);
        }
    }
}
