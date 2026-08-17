// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketNetworkSnapshots} from "../../contracts/contract/network/RocketNetworkSnapshots.sol";
import {RocketNetworkSnapshotsTime} from "../../contracts/contract/network/RocketNetworkSnapshotsTime.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

abstract contract RocketNetworkSnapshotsTestBase is Test {
    RocketStorageMock internal store;

    function setUp() public virtual {
        store = new RocketStorageMock();
        store.setDeployedStatus(true);
        store.setBool(_existsKey(address(this)), true);
    }

    function _existsKey(address _account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }

    function _addressKey(string memory _name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }
}

contract RocketNetworkSnapshotsBlockTest is RocketNetworkSnapshotsTestBase {
    RocketNetworkSnapshots internal snapshots;
    bytes32 internal constant KEY = keccak256("test");

    function setUp() public override {
        super.setUp();
        snapshots = new RocketNetworkSnapshots(RocketStorageInterface(address(store)));
        store.setAddress(_addressKey("rocketNetworkSnapshots"), address(snapshots));
    }

    function testEmptySet() public view {
        assertEq(snapshots.length(KEY), 0);
        assertEq(snapshots.latestBlock(KEY), 0);
        assertEq(snapshots.latestValue(KEY), 0);
        (bool exists, uint32 checkpointBlock, uint224 value) = snapshots.latest(KEY);
        assertFalse(exists);
        assertEq(checkpointBlock, 0);
        assertEq(value, 0);
    }

    function testLookupBeforeBetweenAndAfterCheckpoints() public {
        uint32 first = uint32(block.number + 10);
        vm.roll(first);
        snapshots.push(KEY, 50);
        vm.roll(first + 10);
        snapshots.push(KEY, 150);
        vm.roll(first + 30);
        snapshots.push(KEY, 250);

        assertEq(snapshots.lookup(KEY, first - 1), 0);
        assertEq(snapshots.lookup(KEY, first), 50);
        assertEq(snapshots.lookup(KEY, first + 5), 50);
        assertEq(snapshots.lookup(KEY, first + 10), 150);
        assertEq(snapshots.lookup(KEY, first + 29), 150);
        assertEq(snapshots.lookup(KEY, first + 30), 250);
        assertEq(snapshots.lookup(KEY, first + 31), 250);
    }

    function testPushInSameBlockReplacesLatestCheckpoint() public {
        uint32 checkpointBlock = uint32(block.number + 1);
        vm.roll(checkpointBlock);
        snapshots.push(KEY, 50);
        snapshots.push(KEY, 150);

        assertEq(snapshots.length(KEY), 1);
        assertEq(snapshots.latestBlock(KEY), checkpointBlock);
        assertEq(snapshots.latestValue(KEY), 150);
    }

    function testLookupCheckpointReturnsFullEntry() public {
        uint32 checkpointBlock = uint32(block.number + 1);
        vm.roll(checkpointBlock);
        snapshots.push(KEY, 50);

        (bool beforeExists,,) = snapshots.lookupCheckpoint(KEY, checkpointBlock - 1);
        assertFalse(beforeExists);

        (bool exists, uint32 actualBlock, uint224 value) =
            snapshots.lookupCheckpoint(KEY, checkpointBlock);
        assertTrue(exists);
        assertEq(actualBlock, checkpointBlock);
        assertEq(value, 50);
    }

    function testLookupRecentMatchesLookupAcrossRecencyBoundary() public {
        uint32 first = uint32(block.number + 1);
        for (uint32 i = 0; i < 8; ++i) {
            vm.roll(first + i * 2);
            snapshots.push(KEY, uint224(100 + i));
        }

        for (uint32 query = first - 1; query <= first + 16; ++query) {
            assertEq(snapshots.lookupRecent(KEY, query, 3), snapshots.lookup(KEY, query));
        }
    }

    function testPushRejectsUnregisteredCaller() public {
        address caller = address(0xBEEF);
        vm.prank(caller);
        vm.expectRevert("Invalid or outdated network contract");
        snapshots.push(KEY, 50);
    }

    function testPushRejectsOutdatedSnapshotContract() public {
        store.setAddress(_addressKey("rocketNetworkSnapshots"), address(0xBEEF));
        vm.expectRevert("Invalid or outdated contract");
        snapshots.push(KEY, 50);
    }

    function testFuzzLookupMatchesReference(
        uint32 firstOffset,
        uint32 secondOffset,
        uint224 firstValue,
        uint224 secondValue,
        uint32 queryOffset
    ) public {
        firstOffset = uint32(bound(firstOffset, 1, 1_000));
        secondOffset = uint32(bound(secondOffset, firstOffset + 1, firstOffset + 1_000));
        queryOffset = uint32(bound(queryOffset, 0, secondOffset + 100));
        uint32 base = uint32(block.number);

        vm.roll(base + firstOffset);
        snapshots.push(KEY, firstValue);
        vm.roll(base + secondOffset);
        snapshots.push(KEY, secondValue);

        uint224 expected = queryOffset < firstOffset
            ? 0
            : queryOffset < secondOffset ? firstValue : secondValue;
        assertEq(snapshots.lookup(KEY, base + queryOffset), expected);
    }
}

contract RocketNetworkSnapshotsTimeTest is RocketNetworkSnapshotsTestBase {
    RocketNetworkSnapshotsTime internal snapshots;
    bytes32 internal constant KEY = keccak256("test");

    function setUp() public override {
        super.setUp();
        snapshots = new RocketNetworkSnapshotsTime(RocketStorageInterface(address(store)));
        store.setAddress(_addressKey("rocketNetworkSnapshotsTime"), address(snapshots));
    }

    function testEmptySet() public view {
        assertEq(snapshots.length(KEY), 0);
        assertEq(snapshots.latestTime(KEY), 0);
        assertEq(snapshots.latestValue(KEY), 0);
        (bool exists, uint64 checkpointTime, uint192 value) = snapshots.latest(KEY);
        assertFalse(exists);
        assertEq(checkpointTime, 0);
        assertEq(value, 0);
    }

    function testLookupBeforeBetweenAndAfterCheckpoints() public {
        uint64 first = uint64(block.timestamp + 10);
        vm.warp(first);
        snapshots.push(KEY, 50);
        vm.warp(first + 10);
        snapshots.push(KEY, 150);
        vm.warp(first + 30);
        snapshots.push(KEY, 250);

        assertEq(snapshots.lookup(KEY, first - 1), 0);
        assertEq(snapshots.lookup(KEY, first), 50);
        assertEq(snapshots.lookup(KEY, first + 5), 50);
        assertEq(snapshots.lookup(KEY, first + 10), 150);
        assertEq(snapshots.lookup(KEY, first + 29), 150);
        assertEq(snapshots.lookup(KEY, first + 30), 250);
        assertEq(snapshots.lookup(KEY, first + 31), 250);
    }

    function testPushAtSameTimeReplacesLatestCheckpoint() public {
        uint64 checkpointTime = uint64(block.timestamp + 1);
        vm.warp(checkpointTime);
        snapshots.push(KEY, 50);
        snapshots.push(KEY, 150);

        assertEq(snapshots.length(KEY), 1);
        assertEq(snapshots.latestTime(KEY), checkpointTime);
        assertEq(snapshots.latestValue(KEY), 150);
    }

    function testLookupCheckpointReturnsFullEntry() public {
        uint64 checkpointTime = uint64(block.timestamp + 1);
        vm.warp(checkpointTime);
        snapshots.push(KEY, 50);

        (bool beforeExists,,) = snapshots.lookupCheckpoint(KEY, checkpointTime - 1);
        assertFalse(beforeExists);

        (bool exists, uint64 actualTime, uint192 value) =
            snapshots.lookupCheckpoint(KEY, checkpointTime);
        assertTrue(exists);
        assertEq(actualTime, checkpointTime);
        assertEq(value, 50);
    }

    function testLookupRecentMatchesLookupAcrossRecencyBoundary() public {
        uint64 first = uint64(block.timestamp + 1);
        for (uint64 i = 0; i < 8; ++i) {
            vm.warp(first + i * 2);
            snapshots.push(KEY, uint192(100 + i));
        }

        for (uint64 query = first - 1; query <= first + 16; ++query) {
            assertEq(snapshots.lookupRecent(KEY, query, 3), snapshots.lookup(KEY, query));
        }
    }

    function testPushRejectsUnregisteredCaller() public {
        address caller = address(0xBEEF);
        vm.prank(caller);
        vm.expectRevert("Invalid or outdated network contract");
        snapshots.push(KEY, 50);
    }

    function testPushRejectsOutdatedSnapshotContract() public {
        store.setAddress(_addressKey("rocketNetworkSnapshotsTime"), address(0xBEEF));
        vm.expectRevert("Invalid or outdated contract");
        snapshots.push(KEY, 50);
    }

    function testFuzzLookupMatchesReference(
        uint32 firstOffset,
        uint32 secondOffset,
        uint192 firstValue,
        uint192 secondValue,
        uint32 queryOffset
    ) public {
        firstOffset = uint32(bound(firstOffset, 1, 1_000));
        secondOffset = uint32(bound(secondOffset, firstOffset + 1, firstOffset + 1_000));
        queryOffset = uint32(bound(queryOffset, 0, secondOffset + 100));
        uint64 base = uint64(block.timestamp);

        vm.warp(base + firstOffset);
        snapshots.push(KEY, firstValue);
        vm.warp(base + secondOffset);
        snapshots.push(KEY, secondValue);

        uint192 expected = queryOffset < firstOffset
            ? 0
            : queryOffset < secondOffset ? firstValue : secondValue;
        assertEq(snapshots.lookup(KEY, base + queryOffset), expected);
    }
}
