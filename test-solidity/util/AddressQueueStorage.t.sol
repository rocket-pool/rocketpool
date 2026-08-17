// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {Test} from "forge-std/Test.sol";

import {AddressQueueStorage} from "../../contracts/contract/util/AddressQueueStorage.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketStorageMockV07} from "../helpers/RocketStorageMockV07.sol";

contract AddressQueueStorageTest is Test {
    uint256 internal constant CAPACITY = 2 ** 255;
    bytes32 internal constant PRIMARY = keccak256("primary");
    bytes32 internal constant SECONDARY = keccak256("secondary");

    RocketStorageMockV07 internal store;
    AddressQueueStorage internal queue;

    function setUp() public {
        store = new RocketStorageMockV07();
        store.setDeployedStatus(true);
        queue = new AddressQueueStorage(RocketStorageInterface(address(store)));
        store.setAddress(_addressKey("addressQueueStorage"), address(queue));
        store.setBool(_existsKey(address(this)), true);
    }

    function testEmptyQueue() public {
        assertEq(queue.getLength(PRIMARY), 0);
        assertEq(queue.getIndexOf(PRIMARY, address(0xA11CE)), -1);

        vm.expectRevert(bytes("Queue is empty"));
        queue.dequeueItem(PRIMARY);
    }

    function testEnqueueAndDequeueInFifoOrder() public {
        address first = address(0xA11CE);
        address second = address(0xB0B);
        address third = address(0xCAFE);
        queue.enqueueItem(PRIMARY, first);
        queue.enqueueItem(PRIMARY, second);
        queue.enqueueItem(PRIMARY, third);

        assertEq(queue.getLength(PRIMARY), 3);
        assertEq(queue.getItem(PRIMARY, 0), first);
        assertEq(queue.getItem(PRIMARY, 1), second);
        assertEq(queue.getItem(PRIMARY, 2), third);
        assertEq(queue.getIndexOf(PRIMARY, first), 0);
        assertEq(queue.getIndexOf(PRIMARY, second), 1);
        assertEq(queue.getIndexOf(PRIMARY, third), 2);

        assertEq(queue.dequeueItem(PRIMARY), first);
        assertEq(queue.getLength(PRIMARY), 2);
        assertEq(queue.getItem(PRIMARY, 0), second);
        assertEq(queue.getItem(PRIMARY, 1), third);
        assertEq(queue.getIndexOf(PRIMARY, first), -1);
        assertEq(queue.getIndexOf(PRIMARY, second), 0);
        assertEq(queue.getIndexOf(PRIMARY, third), 1);

        assertEq(queue.dequeueItem(PRIMARY), second);
        assertEq(queue.dequeueItem(PRIMARY), third);
        assertEq(queue.getLength(PRIMARY), 0);
    }

    function testRemoveOnlyItem() public {
        address item = address(0xA11CE);
        queue.enqueueItem(PRIMARY, item);

        queue.removeItem(PRIMARY, item);

        assertEq(queue.getLength(PRIMARY), 0);
        assertEq(queue.getIndexOf(PRIMARY, item), -1);
        queue.enqueueItem(PRIMARY, item);
        assertEq(queue.getLength(PRIMARY), 1);
    }

    function testRemoveMiddleSwapsTailAndUpdatesReverseIndex() public {
        address first = address(0xA11CE);
        address removed = address(0xB0B);
        address third = address(0xCAFE);
        address last = address(0xD00D);
        queue.enqueueItem(PRIMARY, first);
        queue.enqueueItem(PRIMARY, removed);
        queue.enqueueItem(PRIMARY, third);
        queue.enqueueItem(PRIMARY, last);

        queue.removeItem(PRIMARY, removed);

        assertEq(queue.getLength(PRIMARY), 3);
        assertEq(queue.getItem(PRIMARY, 0), first);
        assertEq(queue.getItem(PRIMARY, 1), last);
        assertEq(queue.getItem(PRIMARY, 2), third);
        assertEq(queue.getIndexOf(PRIMARY, first), 0);
        assertEq(queue.getIndexOf(PRIMARY, last), 1);
        assertEq(queue.getIndexOf(PRIMARY, third), 2);
        assertEq(queue.getIndexOf(PRIMARY, removed), -1);
        assertEq(queue.dequeueItem(PRIMARY), first);
        assertEq(queue.dequeueItem(PRIMARY), last);
        assertEq(queue.dequeueItem(PRIMARY), third);
    }

    function testDuplicateItemReverts() public {
        address item = address(0xA11CE);
        queue.enqueueItem(PRIMARY, item);

        vm.expectRevert(bytes("Item already exists in queue"));
        queue.enqueueItem(PRIMARY, item);
    }

    function testRemovingMissingItemReverts() public {
        vm.expectRevert(bytes("Item does not exist in queue"));
        queue.removeItem(PRIMARY, address(0xA11CE));
    }

    function testNamespacesAreIndependent() public {
        address primary = address(0xA11CE);
        address secondary = address(0xB0B);
        queue.enqueueItem(PRIMARY, primary);
        queue.enqueueItem(SECONDARY, secondary);

        assertEq(queue.getLength(PRIMARY), 1);
        assertEq(queue.getLength(SECONDARY), 1);
        assertEq(queue.getItem(PRIMARY, 0), primary);
        assertEq(queue.getItem(SECONDARY, 0), secondary);

        assertEq(queue.dequeueItem(PRIMARY), primary);
        assertEq(queue.getLength(PRIMARY), 0);
        assertEq(queue.getLength(SECONDARY), 1);
    }

    function testRingBufferWrapAround() public {
        store.setUint(_positionKey(PRIMARY, ".start"), CAPACITY - 1);
        store.setUint(_positionKey(PRIMARY, ".end"), CAPACITY - 1);
        address first = address(0xA11CE);
        address second = address(0xB0B);

        queue.enqueueItem(PRIMARY, first);
        queue.enqueueItem(PRIMARY, second);

        assertEq(queue.getLength(PRIMARY), 2);
        assertEq(queue.getItem(PRIMARY, 0), first);
        assertEq(queue.getItem(PRIMARY, 1), second);
        assertEq(queue.getIndexOf(PRIMARY, first), 0);
        assertEq(queue.getIndexOf(PRIMARY, second), 1);
        assertEq(queue.dequeueItem(PRIMARY), first);
        assertEq(queue.getIndexOf(PRIMARY, second), 0);
        assertEq(queue.dequeueItem(PRIMARY), second);
        assertEq(queue.getLength(PRIMARY), 0);
    }

    function testQueueCapacityIsEnforced() public {
        store.setUint(_positionKey(PRIMARY, ".start"), 1);
        store.setUint(_positionKey(PRIMARY, ".end"), 0);
        assertEq(queue.getLength(PRIMARY), CAPACITY - 1);

        vm.expectRevert(bytes("Queue is at capacity"));
        queue.enqueueItem(PRIMARY, address(0xA11CE));
    }

    function testRejectsUnregisteredCaller() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("Invalid or outdated network contract"));
        queue.enqueueItem(PRIMARY, address(0xA11CE));
    }

    function testRejectsOutdatedStorageContract() public {
        store.setAddress(_addressKey("addressQueueStorage"), address(0xBEEF));

        vm.expectRevert(bytes("Invalid or outdated contract"));
        queue.enqueueItem(PRIMARY, address(0xA11CE));
    }

    function testFuzzFifoMaintainsItemsAndReverseIndexes(
        address first,
        address second,
        address third
    ) public {
        vm.assume(first != second && first != third && second != third);
        queue.enqueueItem(PRIMARY, first);
        queue.enqueueItem(PRIMARY, second);
        queue.enqueueItem(PRIMARY, third);

        assertEq(queue.getLength(PRIMARY), 3);
        assertEq(queue.getIndexOf(PRIMARY, first), 0);
        assertEq(queue.getIndexOf(PRIMARY, second), 1);
        assertEq(queue.getIndexOf(PRIMARY, third), 2);
        assertEq(queue.dequeueItem(PRIMARY), first);
        assertEq(queue.getIndexOf(PRIMARY, first), -1);
        assertEq(queue.getIndexOf(PRIMARY, second), 0);
        assertEq(queue.getIndexOf(PRIMARY, third), 1);
        assertEq(queue.dequeueItem(PRIMARY), second);
        assertEq(queue.dequeueItem(PRIMARY), third);
        assertEq(queue.getLength(PRIMARY), 0);
    }

    function _positionKey(bytes32 _key, string memory _suffix) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_key, _suffix));
    }

    function _addressKey(string memory _name) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }

    function _existsKey(address _account) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }
}
