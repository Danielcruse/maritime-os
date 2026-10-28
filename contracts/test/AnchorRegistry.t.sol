// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AnchorRegistry} from "../src/AnchorRegistry.sol";

contract AnchorRegistryTest is Test {
    AnchorRegistry registry;
    address owner = address(this);
    address submitter = address(0xBEEF);
    address stranger = address(0xDEAD);

    function setUp() public {
        registry = new AnchorRegistry(submitter);
    }

    function testConstructorSetsOwnerAndSubmitter() public view {
        assertEq(registry.owner(), owner);
        assertEq(registry.submitter(), submitter);
    }

    function testConstructorDefaultsSubmitterToDeployerWhenZeroAddress() public {
        AnchorRegistry r2 = new AnchorRegistry(address(0));
        assertEq(r2.submitter(), owner);
    }

    function testSubmitAnchorStoresAndEmits() public {
        bytes32 root = keccak256("batch-1");
        bytes32 ref = bytes32(uint256(1));

        vm.expectEmit(true, true, true, true);
        emit AnchorRegistry.AnchorSubmitted(0, root, ref, 5, uint64(block.timestamp), submitter);

        vm.prank(submitter);
        uint256 index = registry.submitAnchor(root, 5, ref);

        assertEq(index, 0);
        assertEq(registry.anchorCount(), 1);

        (bytes32 storedRoot, uint64 eventCount, uint64 timestamp, address anchorSubmitter) = registry.getAnchor(0);
        assertEq(storedRoot, root);
        assertEq(eventCount, 5);
        assertEq(timestamp, uint64(block.timestamp));
        assertEq(anchorSubmitter, submitter);
        assertEq(registry.indexOfRoot(root), 1); // 1-based
        assertTrue(registry.offChainRefAnchored(ref));
    }

    function testSubmitAnchorRevertsForNonSubmitter() public {
        vm.prank(stranger);
        vm.expectRevert(AnchorRegistry.NotSubmitter.selector);
        registry.submitAnchor(keccak256("x"), 1, bytes32(uint256(1)));
    }

    function testSubmitAnchorRevertsOnEmptyRoot() public {
        vm.prank(submitter);
        vm.expectRevert(AnchorRegistry.EmptyRoot.selector);
        registry.submitAnchor(bytes32(0), 1, bytes32(uint256(1)));
    }

    function testSubmitAnchorRevertsOnZeroEventCount() public {
        vm.prank(submitter);
        vm.expectRevert(AnchorRegistry.ZeroEventCount.selector);
        registry.submitAnchor(keccak256("x"), 0, bytes32(uint256(1)));
    }

    function testSubmitAnchorRevertsOnDuplicateReference() public {
        bytes32 ref = bytes32(uint256(42));
        vm.startPrank(submitter);
        registry.submitAnchor(keccak256("a"), 1, ref);
        vm.expectRevert(AnchorRegistry.ReferenceAlreadyAnchored.selector);
        registry.submitAnchor(keccak256("b"), 1, ref);
        vm.stopPrank();
    }

    function testMultipleAnchorsIncrementIndex() public {
        vm.startPrank(submitter);
        registry.submitAnchor(keccak256("a"), 1, bytes32(uint256(1)));
        uint256 secondIndex = registry.submitAnchor(keccak256("b"), 2, bytes32(uint256(2)));
        vm.stopPrank();

        assertEq(secondIndex, 1);
        assertEq(registry.anchorCount(), 2);
    }

    function testGetAnchorRevertsOutOfRange() public {
        vm.expectRevert(AnchorRegistry.IndexOutOfRange.selector);
        registry.getAnchor(0);
    }

    function testOnlyOwnerCanSetSubmitter() public {
        address newSubmitter = address(0xCAFE);

        vm.prank(stranger);
        vm.expectRevert(AnchorRegistry.NotOwner.selector);
        registry.setSubmitter(newSubmitter);

        registry.setSubmitter(newSubmitter); // called as owner (address(this))
        assertEq(registry.submitter(), newSubmitter);
    }

    function testIndexOfRootReturnsZeroWhenNotFound() public view {
        assertEq(registry.indexOfRoot(keccak256("never-anchored")), 0);
    }
}
