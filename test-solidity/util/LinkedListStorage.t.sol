// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {LinkedListStorage} from "../../contracts/contract/util/LinkedListStorage.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {LinkedListStorageInterface} from "../../contracts/interface/util/LinkedListStorageInterface.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract LinkedListStorageHarness is LinkedListStorage {
    constructor(RocketStorageInterface _rocketStorage) LinkedListStorage(_rocketStorage) {}

    function packItem(DepositQueueValue memory _item) external pure returns (uint256) {
        return _packItem(_item);
    }

    function unpackItem(uint256 _packedItem) external pure returns (DepositQueueValue memory) {
        return _unpackItem(_packedItem);
    }
}

contract LinkedListStorageTest is Test {
    bytes32 internal constant REGULAR = keccak256("regular");
    bytes32 internal constant EXPRESS = keccak256("express");

    RocketStorageMock internal store;
    LinkedListStorageHarness internal list;

    function setUp() public {
        store = new RocketStorageMock();
        store.setDeployedStatus(true);
        list = new LinkedListStorageHarness(RocketStorageInterface(address(store)));
        store.setAddress(
            keccak256(abi.encodePacked("contract.address", "linkedListStorage")),
            address(list)
        );
        store.setBool(
            keccak256(abi.encodePacked("contract.exists", address(this))),
            true
        );
    }

    function testFuzzPackUnpackRoundTrip(
        address receiver,
        uint32 validatorId,
        uint32 suppliedValue,
        uint32 requestedValue
    ) public view {
        LinkedListStorageInterface.DepositQueueValue memory expected =
            _item(receiver, validatorId, suppliedValue, requestedValue);

        LinkedListStorageInterface.DepositQueueValue memory actual =
            list.unpackItem(list.packItem(expected));

        _assertItem(actual, expected);
    }

    function testEmptyQueue() public {
        LinkedListStorageInterface.DepositQueueKey memory missing =
            _key(address(0xA11CE), 1);

        assertEq(list.getLength(REGULAR), 0);
        assertEq(list.getHeadIndex(REGULAR), 0);
        assertEq(list.getIndexOf(REGULAR, missing), 0);

        vm.expectRevert("Queue can't be empty");
        list.peekItem(REGULAR);

        vm.expectRevert("Queue can't be empty");
        list.dequeueItem(REGULAR);
    }

    function testEnqueueRemoveMiddleAndDequeueInOrder() public {
        LinkedListStorageInterface.DepositQueueValue memory first =
            _item(address(0xA11CE), 1, 8_000, 32_000);
        LinkedListStorageInterface.DepositQueueValue memory second =
            _item(address(0xB0B), 2, 4_000, 28_000);
        LinkedListStorageInterface.DepositQueueValue memory third =
            _item(address(0xCAFE), 3, 16_000, 16_000);

        list.enqueueItem(REGULAR, first);
        list.enqueueItem(REGULAR, second);
        list.enqueueItem(REGULAR, third);

        assertEq(list.getLength(REGULAR), 3);
        assertEq(list.getHeadIndex(REGULAR), 1);
        assertEq(list.getIndexOf(REGULAR, _key(first.receiver, first.validatorId)), 1);
        assertEq(list.getIndexOf(REGULAR, _key(second.receiver, second.validatorId)), 2);
        assertEq(list.getIndexOf(REGULAR, _key(third.receiver, third.validatorId)), 3);
        _assertItem(list.getItem(REGULAR, 1), first);
        _assertItem(list.getItem(REGULAR, 2), second);
        _assertItem(list.getItem(REGULAR, 3), third);
        _assertItem(list.peekItem(REGULAR), first);
        _assertItem(list.getPreviousItem(REGULAR, second), first);
        _assertItem(list.getNextItem(REGULAR, second), third);

        list.removeItem(REGULAR, _key(second.receiver, second.validatorId));

        assertEq(list.getLength(REGULAR), 2);
        assertEq(list.getIndexOf(REGULAR, _key(second.receiver, second.validatorId)), 0);
        _assertItem(list.getNextItem(REGULAR, first), third);
        _assertItem(list.getPreviousItem(REGULAR, third), first);
        _assertItem(list.dequeueItem(REGULAR), first);
        _assertItem(list.dequeueItem(REGULAR), third);
        assertEq(list.getLength(REGULAR), 0);
        assertEq(list.getHeadIndex(REGULAR), 0);
    }

    function testRemoveOnlyItem() public {
        LinkedListStorageInterface.DepositQueueValue memory item =
            _item(address(0xA11CE), 1, 8_000, 32_000);
        list.enqueueItem(REGULAR, item);

        list.removeItem(REGULAR, _key(item.receiver, item.validatorId));

        assertEq(list.getLength(REGULAR), 0);
        assertEq(list.getHeadIndex(REGULAR), 0);
        assertEq(list.getIndexOf(REGULAR, _key(item.receiver, item.validatorId)), 0);
    }

    function testRemoveHeadAndTailPreservesRemainingItem() public {
        LinkedListStorageInterface.DepositQueueValue memory first =
            _item(address(0xA11CE), 1, 8_000, 32_000);
        LinkedListStorageInterface.DepositQueueValue memory second =
            _item(address(0xB0B), 2, 4_000, 28_000);
        LinkedListStorageInterface.DepositQueueValue memory third =
            _item(address(0xCAFE), 3, 16_000, 16_000);
        list.enqueueItem(REGULAR, first);
        list.enqueueItem(REGULAR, second);
        list.enqueueItem(REGULAR, third);

        list.removeItem(REGULAR, _key(first.receiver, first.validatorId));
        list.removeItem(REGULAR, _key(third.receiver, third.validatorId));

        assertEq(list.getLength(REGULAR), 1);
        assertEq(list.getHeadIndex(REGULAR), 2);
        _assertItem(list.peekItem(REGULAR), second);
        _assertZeroItem(list.getPreviousItem(REGULAR, second));
        _assertZeroItem(list.getNextItem(REGULAR, second));
    }

    function testDuplicateItemReverts() public {
        LinkedListStorageInterface.DepositQueueValue memory item =
            _item(address(0xA11CE), 1, 8_000, 32_000);
        list.enqueueItem(REGULAR, item);

        vm.expectRevert("Item already exists in queue");
        list.enqueueItem(REGULAR, item);
    }

    function testRemovingMissingItemReverts() public {
        vm.expectRevert("Item does not exist in queue");
        list.removeItem(REGULAR, _key(address(0xA11CE), 1));
    }

    function testNamespacesAreIndependent() public {
        LinkedListStorageInterface.DepositQueueValue memory regular =
            _item(address(0xA11CE), 1, 8_000, 32_000);
        LinkedListStorageInterface.DepositQueueValue memory express =
            _item(address(0xB0B), 2, 4_000, 28_000);

        list.enqueueItem(REGULAR, regular);
        list.enqueueItem(EXPRESS, express);

        assertEq(list.getLength(REGULAR), 1);
        assertEq(list.getLength(EXPRESS), 1);
        _assertItem(list.peekItem(REGULAR), regular);
        _assertItem(list.peekItem(EXPRESS), express);

        list.dequeueItem(REGULAR);
        assertEq(list.getLength(REGULAR), 0);
        assertEq(list.getLength(EXPRESS), 1);
        _assertItem(list.peekItem(EXPRESS), express);
    }

    function testScanPaginatesAndShortensFinalPage() public {
        for (uint32 validatorId = 1; validatorId <= 5; ++validatorId) {
            list.enqueueItem(
                REGULAR,
                _item(
                    address(uint160(uint256(validatorId))),
                    validatorId,
                    validatorId * 1_000,
                    validatorId * 2_000
                )
            );
        }

        (
            LinkedListStorageInterface.DepositQueueValue[] memory firstPage,
            uint256 nextIndex
        ) = list.scan(REGULAR, 0, 2);
        assertEq(firstPage.length, 2);
        assertEq(firstPage[0].validatorId, 1);
        assertEq(firstPage[1].validatorId, 2);
        assertEq(nextIndex, 3);

        (
            LinkedListStorageInterface.DepositQueueValue[] memory secondPage,
            uint256 finalIndex
        ) = list.scan(REGULAR, nextIndex, 10);
        assertEq(secondPage.length, 3);
        assertEq(secondPage[0].validatorId, 3);
        assertEq(secondPage[1].validatorId, 4);
        assertEq(secondPage[2].validatorId, 5);
        assertEq(finalIndex, 0);
    }

    function _item(
        address receiver,
        uint32 validatorId,
        uint32 suppliedValue,
        uint32 requestedValue
    ) internal pure returns (LinkedListStorageInterface.DepositQueueValue memory) {
        return LinkedListStorageInterface.DepositQueueValue({
            receiver: receiver,
            validatorId: validatorId,
            suppliedValue: suppliedValue,
            requestedValue: requestedValue
        });
    }

    function _key(
        address receiver,
        uint32 validatorId
    ) internal pure returns (LinkedListStorageInterface.DepositQueueKey memory) {
        return LinkedListStorageInterface.DepositQueueKey({
            receiver: receiver,
            validatorId: validatorId
        });
    }

    function _assertItem(
        LinkedListStorageInterface.DepositQueueValue memory actual,
        LinkedListStorageInterface.DepositQueueValue memory expected
    ) internal pure {
        assertEq(actual.receiver, expected.receiver);
        assertEq(actual.validatorId, expected.validatorId);
        assertEq(actual.suppliedValue, expected.suppliedValue);
        assertEq(actual.requestedValue, expected.requestedValue);
    }

    function _assertZeroItem(
        LinkedListStorageInterface.DepositQueueValue memory actual
    ) internal pure {
        _assertItem(actual, _item(address(0), 0, 0, 0));
    }
}
