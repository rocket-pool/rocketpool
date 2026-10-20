// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RocketNetworkExit} from "../../contracts/contract/network/RocketNetworkExit.sol";
import {RocketNetworkExitInterface} from "../../contracts/interface/network/RocketNetworkExitInterface.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {Bytes32SetStorage} from "../../contracts/contract/util/Bytes32SetStorage.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract ExitEncodingHarness is RocketNetworkExit {
    constructor(RocketStorageInterface _store) RocketNetworkExit(_store, payable(address(0))) {}

    function encode(address _pool, uint32 _id, bool _isMegapool) external pure returns (bytes32) {
        return _encodeRequestedExit(_pool, _id, _isMegapool);
    }
}

contract RocketNetworkExitEnumerationTest is Test {
    bytes32 internal constant NAMESPACE = keccak256("exit.requested.index");
    ExitEncodingHarness internal exits;
    Bytes32SetStorage internal exitSet;

    function setUp() public {
        RocketStorageMock store = new RocketStorageMock();
        exitSet = new Bytes32SetStorage(RocketStorageInterface(address(store)));
        exits = new ExitEncodingHarness(RocketStorageInterface(address(store)));
        store.setAddress(keccak256(abi.encodePacked("contract.address", "bytes32SetStorage")), address(exitSet));
        store.setBool(keccak256(abi.encodePacked("contract.exists", address(this))), true);
    }

    function testFuzzEncodingAndPublicDecoding(address _pool, uint32 _id, bool _isMegapool) public {
        bytes32 encoded = exits.encode(_pool, _id, _isMegapool);
        // Independent byte representation: seven reserved bytes, type, ID, address.
        bytes32 expected = bytes32(abi.encodePacked(bytes7(0), _isMegapool ? bytes1(0x01) : bytes1(0), _isMegapool ? _id : uint32(0), _pool));
        assertEq(encoded, expected);
        exitSet.addItem(NAMESPACE, encoded);
        RocketNetworkExitInterface.RequestedExit memory entry = exits.getRequestedExitAt(0);
        assertEq(entry.pool, _pool);
        assertEq(entry.validatorId, _isMegapool ? _id : 0);
        assertEq(entry.isMegapool, _isMegapool);
    }

    function testMixedEntriesPaginationAndSwapRemoval() public {
        address pool = address(type(uint160).max);
        bytes32 mini = exits.encode(pool, 123, false);
        bytes32 megaZero = exits.encode(pool, 0, true);
        bytes32 megaMax = exits.encode(pool, type(uint32).max, true);
        exitSet.addItem(NAMESPACE, mini);
        exitSet.addItem(NAMESPACE, megaZero);
        exitSet.addItem(NAMESPACE, megaMax);
        assertEq(exits.getRequestedExitCount(), 3);
        RocketNetworkExitInterface.RequestedExit[] memory page = exits.getRequestedExits(1, type(uint256).max);
        assertEq(page.length, 2);
        assertEq(page[0].validatorId, 0);
        assertTrue(page[0].isMegapool);
        assertEq(page[1].validatorId, type(uint32).max);
        assertEq(page[1].pool, pool);
        assertEq(exits.getRequestedExits(0, 1).length, 1);
        assertEq(exits.getRequestedExits(0, 0).length, 0);
        assertEq(exits.getRequestedExits(3, 1).length, 0);
        assertEq(exits.getRequestedExits(type(uint256).max, type(uint256).max).length, 0);
        exitSet.removeItem(NAMESPACE, megaZero);
        page = exits.getRequestedExits(0, type(uint256).max);
        assertEq(page.length, 2);
        assertFalse(page[0].isMegapool);
        assertEq(page[0].validatorId, 0);
        assertEq(page[1].validatorId, type(uint32).max);
        vm.expectRevert(bytes("Index out of bounds"));
        exits.getRequestedExitAt(2);
    }

    function testEmptyEnumeration() public {
        assertEq(exits.getRequestedExitCount(), 0);
        assertEq(exits.getRequestedExits(0, type(uint256).max).length, 0);
        vm.expectRevert(bytes("Index out of bounds"));
        exits.getRequestedExitAt(0);
    }
}
