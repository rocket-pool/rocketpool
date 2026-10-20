// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {Bytes32SetStorage} from "../../contracts/contract/util/Bytes32SetStorage.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract Bytes32SetStorageTest is Test {
    bytes32 internal constant PRIMARY = keccak256("primary");
    bytes32 internal constant SECONDARY = keccak256("secondary");

    RocketStorageMock internal store;
    Bytes32SetStorage internal set;

    function setUp() public {
        store = new RocketStorageMock();
        store.setDeployedStatus(true);
        set = new Bytes32SetStorage(RocketStorageInterface(address(store)));
        store.setAddress(_addressKey("bytes32SetStorage"), address(set));
        store.setBool(_existsKey(address(this)), true);
    }

    function testEmptySet() public view {
        assertEq(set.getCount(PRIMARY), 0);
        assertEq(set.getIndexOf(PRIMARY, bytes32(uint256(0xA11CE))), -1);
    }

    function testAddsItemsAndMaintainsIndexes() public {
        bytes32 first = bytes32(uint256(0xA11CE));
        bytes32 second = bytes32(uint256(0xB0B));
        bytes32 third = bytes32(uint256(0xCAFE));

        set.addItem(PRIMARY, first);
        set.addItem(PRIMARY, second);
        set.addItem(PRIMARY, third);

        assertEq(set.getCount(PRIMARY), 3);
        assertEq(set.getItem(PRIMARY, 0), first);
        assertEq(set.getItem(PRIMARY, 1), second);
        assertEq(set.getItem(PRIMARY, 2), third);
        assertEq(set.getIndexOf(PRIMARY, first), 0);
        assertEq(set.getIndexOf(PRIMARY, second), 1);
        assertEq(set.getIndexOf(PRIMARY, third), 2);
    }

    function testRemoveOnlyItem() public {
        bytes32 item = bytes32(uint256(0xA11CE));
        set.addItem(PRIMARY, item);

        set.removeItem(PRIMARY, item);

        assertEq(set.getCount(PRIMARY), 0);
        assertEq(set.getIndexOf(PRIMARY, item), -1);
    }

    function testRemoveLastItemPreservesEarlierIndexes() public {
        bytes32 first = bytes32(uint256(0xA11CE));
        bytes32 second = bytes32(uint256(0xB0B));
        set.addItem(PRIMARY, first);
        set.addItem(PRIMARY, second);

        set.removeItem(PRIMARY, second);

        assertEq(set.getCount(PRIMARY), 1);
        assertEq(set.getItem(PRIMARY, 0), first);
        assertEq(set.getIndexOf(PRIMARY, first), 0);
        assertEq(set.getIndexOf(PRIMARY, second), -1);
    }

    function testRemoveMiddleSwapsTailAndUpdatesReverseIndex() public {
        bytes32 first = bytes32(uint256(0xA11CE));
        bytes32 middle = bytes32(uint256(0xB0B));
        bytes32 last = bytes32(uint256(0xCAFE));
        set.addItem(PRIMARY, first);
        set.addItem(PRIMARY, middle);
        set.addItem(PRIMARY, last);

        set.removeItem(PRIMARY, middle);

        assertEq(set.getCount(PRIMARY), 2);
        assertEq(set.getItem(PRIMARY, 0), first);
        assertEq(set.getItem(PRIMARY, 1), last);
        assertEq(set.getIndexOf(PRIMARY, first), 0);
        assertEq(set.getIndexOf(PRIMARY, last), 1);
        assertEq(set.getIndexOf(PRIMARY, middle), -1);
    }

    function testDuplicateItemReverts() public {
        bytes32 item = bytes32(uint256(0xA11CE));
        set.addItem(PRIMARY, item);

        vm.expectRevert(bytes("Item already exists in set"));
        set.addItem(PRIMARY, item);
    }

    function testRemovingMissingItemReverts() public {
        vm.expectRevert(bytes("Item does not exist in set"));
        set.removeItem(PRIMARY, bytes32(uint256(0xA11CE)));
    }

    function testNamespacesAreIndependent() public {
        bytes32 primary = bytes32(uint256(0xA11CE));
        bytes32 secondary = bytes32(uint256(0xB0B));
        set.addItem(PRIMARY, primary);
        set.addItem(SECONDARY, secondary);

        assertEq(set.getCount(PRIMARY), 1);
        assertEq(set.getCount(SECONDARY), 1);
        assertEq(set.getItem(PRIMARY, 0), primary);
        assertEq(set.getItem(SECONDARY, 0), secondary);

        set.removeItem(PRIMARY, primary);
        assertEq(set.getCount(PRIMARY), 0);
        assertEq(set.getCount(SECONDARY), 1);
    }

    function testRejectsUnregisteredCaller() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("Invalid or outdated network contract"));
        set.addItem(PRIMARY, bytes32(uint256(0xA11CE)));
    }

    function testRejectsOutdatedStorageContract() public {
        store.setAddress(_addressKey("bytes32SetStorage"), address(0xBEEF));

        vm.expectRevert(bytes("Invalid or outdated contract"));
        set.addItem(PRIMARY, bytes32(uint256(0xA11CE)));
    }

    function testFuzzSwapRemovalMaintainsReverseIndexes(
        bytes32 first,
        bytes32 middle,
        bytes32 last
    ) public {
        vm.assume(first != middle && first != last && middle != last);
        set.addItem(PRIMARY, first);
        set.addItem(PRIMARY, middle);
        set.addItem(PRIMARY, last);

        set.removeItem(PRIMARY, middle);

        assertEq(set.getCount(PRIMARY), 2);
        assertEq(set.getItem(PRIMARY, 0), first);
        assertEq(set.getItem(PRIMARY, 1), last);
        assertEq(set.getIndexOf(PRIMARY, first), 0);
        assertEq(set.getIndexOf(PRIMARY, middle), -1);
        assertEq(set.getIndexOf(PRIMARY, last), 1);
    }

    function testZeroAndFullWidthValuesAndReaddition() public {
        bytes32 full = bytes32(type(uint256).max);
        set.addItem(PRIMARY, bytes32(0));
        set.addItem(PRIMARY, full);
        assertEq(set.getItem(PRIMARY, 0), bytes32(0));
        assertEq(set.getItem(PRIMARY, 1), full);
        set.removeItem(PRIMARY, bytes32(0));
        assertEq(set.getItem(PRIMARY, 0), full);
        assertEq(set.getIndexOf(PRIMARY, full), 0);
        assertEq(set.getIndexOf(PRIMARY, bytes32(0)), -1);
        assertEq(store.getBytes32(keccak256(abi.encodePacked(PRIMARY, ".item", uint256(1)))), bytes32(0));
        set.addItem(PRIMARY, bytes32(0));
        assertEq(set.getIndexOf(PRIMARY, bytes32(0)), 1);
        set.removeItem(PRIMARY, full);
        set.removeItem(PRIMARY, bytes32(0));
        assertEq(set.getCount(PRIMARY), 0);
    }

    function testBoundsAndMissingRemovalAfterDeletion() public {
        vm.expectRevert(bytes("Index out of bounds"));
        set.getItem(PRIMARY, 0);
        set.addItem(PRIMARY, bytes32(uint256(1)));
        vm.expectRevert(bytes("Index out of bounds"));
        set.getItem(PRIMARY, 1);
        vm.expectRevert(bytes("Index out of bounds"));
        set.getItem(PRIMARY, type(uint256).max);
        set.removeItem(PRIMARY, bytes32(uint256(1)));
        vm.expectRevert(bytes("Index out of bounds"));
        set.getItem(PRIMARY, 0);
        vm.expectRevert(bytes("Item does not exist in set"));
        set.removeItem(PRIMARY, bytes32(uint256(1)));
    }

    function testRemovalAuthorization() public {
        set.addItem(PRIMARY, bytes32(0));
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("Invalid or outdated network contract"));
        set.removeItem(PRIMARY, bytes32(0));
        store.setAddress(_addressKey("bytes32SetStorage"), address(0xBEEF));
        vm.expectRevert(bytes("Invalid or outdated contract"));
        set.removeItem(PRIMARY, bytes32(0));
    }

    function _addressKey(string memory _name) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }

    function _existsKey(address _account) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }
}
