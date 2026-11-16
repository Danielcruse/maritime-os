// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../src/AnchorRegistry.sol";

contract AnchorRegistryTest is Test {
    AnchorRegistry registry;

    function setUp() public {
        registry = new AnchorRegistry();
    }

    function testAnyAccountCanSubmitAndRecordCaller() public {
        bytes32 root = keccak256("batch-1");
        bytes32 ref = bytes32(uint256(1));
        address participant = address(0xBEEF);

        vm.prank(participant);
        uint256 index = registry.submitAnchor(root, 5, ref);

        assertEq(index, 0);
        assertEq(registry.anchorCount(), 1);
        (bytes32 storedRoot, uint64 eventCount,, address submitter) = registry.getAnchor(0);
        assertEq(storedRoot, root);
        assertEq(eventCount, 5);
        assertEq(submitter, participant);
        assertTrue(registry.offChainRefAnchored(ref));
    }

    function testDifferentAccountsCanSubmitWithoutPrivilegedSetup() public {
        vm.prank(address(0xBEEF));
        registry.submitAnchor(keccak256("a"), 1, bytes32(uint256(1)));
        vm.prank(address(0xCAFE));
        registry.submitAnchor(keccak256("b"), 2, bytes32(uint256(2)));
        assertEq(registry.anchorCount(), 2);
    }

    function testSubmitAnchorRevertsOnEmptyRoot() public {
        vm.expectRevert(AnchorRegistry.EmptyRoot.selector);
        registry.submitAnchor(bytes32(0), 1, bytes32(uint256(1)));
    }

    function testSubmitAnchorRevertsOnZeroEventCount() public {
        vm.expectRevert(AnchorRegistry.ZeroEventCount.selector);
        registry.submitAnchor(keccak256("x"), 0, bytes32(uint256(1)));
    }

    function testSubmitAnchorRevertsOnDuplicateReference() public {
        bytes32 ref = bytes32(uint256(42));
        registry.submitAnchor(keccak256("a"), 1, ref);
        vm.expectRevert(AnchorRegistry.ReferenceAlreadyAnchored.selector);
        registry.submitAnchor(keccak256("b"), 1, ref);
    }

    function testMultipleAnchorsIncrementIndex() public {
        registry.submitAnchor(keccak256("a"), 1, bytes32(uint256(1)));
        uint256 secondIndex = registry.submitAnchor(keccak256("b"), 2, bytes32(uint256(2)));
        assertEq(secondIndex, 1);
        assertEq(registry.anchorCount(), 2);
    }

    function testGetAnchorRevertsOutOfRange() public {
        vm.expectRevert(AnchorRegistry.IndexOutOfRange.selector);
        registry.getAnchor(0);
    }

    function testIndexOfRootReturnsZeroWhenNotFound() public view {
        assertEq(registry.indexOfRoot(keccak256("never-anchored")), 0);
    }

    function testVerifyInclusionOddBatch() public {
        bytes32 root = bytes32(0x9d6b564cf278381e1c0762a7925c2b3d540e33443797f3a5cc570b84f4e90d50);
        registry.submitAnchor(root, 5, bytes32(uint256(100)));

        string memory leaf = "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d";
        string[] memory proof = new string[](3);
        proof[0] = "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea";
        proof[1] = "3474e6da9272c8c6282c1fcd66ae507af47c831286b0ac7bd718f7d37738a2f7";
        proof[2] = "807e17649ecc44b447796ad500b8d0328cc9586b0f3710fedac1b45f2a603721";
        bool[] memory siblingIsLeft = new bool[](3);
        siblingIsLeft[0] = false;
        siblingIsLeft[1] = true;
        siblingIsLeft[2] = false;
        assertTrue(registry.verifyInclusion(0, leaf, proof, siblingIsLeft));
    }

    function testVerifyInclusionRejectsWrongLeaf() public {
        bytes32 root = bytes32(0xd9e700b75b50aa36c407eba8382ce536ceb71b44a3dd2b0132cc6f00c91c8e7c);
        registry.submitAnchor(root, 4, bytes32(uint256(101)));
        string[] memory proof = new string[](2);
        proof[0] = "50e721e49c013f00c62cf59f2163542a9d8df02464efeb615d31051b0fddc326";
        proof[1] = "02ca1321266a93c4e204f2a4196ef95302ccaef71a4826980122a602f6736e8d";
        bool[] memory directions = new bool[](2);
        assertFalse(registry.verifyInclusion(0, "0000000000000000000000000000000000000000000000000000000000000000", proof, directions));
    }

    function testVerifyInclusionRejectsMalformedLeafAndSibling() public {
        registry.submitAnchor(keccak256("root"), 1, bytes32(uint256(102)));
        string[] memory proof = new string[](1);
        bool[] memory directions = new bool[](1);
        proof[0] = "xyz";
        vm.expectRevert(AnchorRegistry.InvalidHexLength.selector);
        registry.verifyInclusion(0, "0000000000000000000000000000000000000000000000000000000000000000", proof, directions);

        proof[0] = "000000000000000000000000000000000000000000000000000000000000000g";
        vm.expectRevert(AnchorRegistry.InvalidHexChar.selector);
        registry.verifyInclusion(0, "0000000000000000000000000000000000000000000000000000000000000000", proof, directions);
    }

    function testVerifyInclusionRejectsUppercaseHash() public {
        registry.submitAnchor(keccak256("root"), 1, bytes32(uint256(103)));
        string[] memory proof = new string[](0);
        bool[] memory directions = new bool[](0);
        vm.expectRevert(AnchorRegistry.InvalidHexChar.selector);
        registry.verifyInclusion(0, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", proof, directions);
    }

    function testVerifyInclusionRevertsOnProofLengthMismatch() public {
        registry.submitAnchor(keccak256("root"), 1, bytes32(uint256(104)));
        string[] memory proof = new string[](1);
        bool[] memory directions = new bool[](0);
        vm.expectRevert(AnchorRegistry.ProofLengthMismatch.selector);
        registry.verifyInclusion(0, "0000000000000000000000000000000000000000000000000000000000000000", proof, directions);
    }
}
