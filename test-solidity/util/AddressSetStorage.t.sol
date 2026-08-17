// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {Test} from "forge-std/Test.sol";

import {AddressSetStorage} from "../../contracts/contract/util/AddressSetStorage.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketStorageMockV07} from "../helpers/RocketStorageMockV07.sol";

contract AddressSetStorageTest is Test {
    bytes32 internal constant PRIMARY = keccak256("primary");
    bytes32 internal constant SECONDARY = keccak256("secondary");

    RocketStorageMockV07 internal store;
    AddressSetStorage internal set;

    function setUp() public {
        store = new RocketStorageMockV07();
        store.setDeployedStatus(true);
        set = new AddressSetStorage(RocketStorageInterface(address(store)));
        store.setAddress(_addressKey("addressSetStorage"), address(set));
        store.setBool(_existsKey(address(this)), true);
    }

    function testEmptySet() public view {
        assertEq(set.getCount(PRIMARY), 0);
        assertEq(set.getIndexOf(PRIMARY, address(0xA11CE)), -1);
    }

    function testAddsItemsAndMaintainsIndexes() public {
        address first = address(0xA11CE);
        address second = address(0xB0B);
        address third = address(0xCAFE);

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
        address item = address(0xA11CE);
        set.addItem(PRIMARY, item);

        set.removeItem(PRIMARY, item);

        assertEq(set.getCount(PRIMARY), 0);
        assertEq(set.getIndexOf(PRIMARY, item), -1);
    }

    function testRemoveLastItemPreservesEarlierIndexes() public {
        address first = address(0xA11CE);
        address second = address(0xB0B);
        set.addItem(PRIMARY, first);
        set.addItem(PRIMARY, second);

        set.removeItem(PRIMARY, second);

        assertEq(set.getCount(PRIMARY), 1);
        assertEq(set.getItem(PRIMARY, 0), first);
        assertEq(set.getIndexOf(PRIMARY, first), 0);
        assertEq(set.getIndexOf(PRIMARY, second), -1);
    }

    function testRemoveMiddleSwapsTailAndUpdatesReverseIndex() public {
        address first = address(0xA11CE);
        address middle = address(0xB0B);
        address last = address(0xCAFE);
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
        address item = address(0xA11CE);
        set.addItem(PRIMARY, item);

        vm.expectRevert(bytes("Item already exists in set"));
        set.addItem(PRIMARY, item);
    }

    function testRemovingMissingItemReverts() public {
        vm.expectRevert(bytes("Item does not exist in set"));
        set.removeItem(PRIMARY, address(0xA11CE));
    }

    function testNamespacesAreIndependent() public {
        address primary = address(0xA11CE);
        address secondary = address(0xB0B);
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
        set.addItem(PRIMARY, address(0xA11CE));
    }

    function testRejectsOutdatedStorageContract() public {
        store.setAddress(_addressKey("addressSetStorage"), address(0xBEEF));

        vm.expectRevert(bytes("Invalid or outdated contract"));
        set.addItem(PRIMARY, address(0xA11CE));
    }

    function testFuzzSwapRemovalMaintainsReverseIndexes(
        address first,
        address middle,
        address last
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

    function _addressKey(string memory _name) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }

    function _existsKey(address _account) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }
}
