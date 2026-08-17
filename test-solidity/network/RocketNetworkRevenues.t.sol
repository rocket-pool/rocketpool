// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsNetwork} from "../../contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsNetwork.sol";
import {RocketNetworkRevenues} from "../../contracts/contract/network/RocketNetworkRevenues.sol";
import {RocketNetworkSnapshotsTime} from "../../contracts/contract/network/RocketNetworkSnapshotsTime.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract RocketNetworkRevenuesTest is Test {
    uint256 internal constant START_TIME = 1_000_000;
    uint256 internal constant INITIAL_NODE_SHARE = 0.05 ether;
    uint256 internal constant INITIAL_VOTER_SHARE = 0.09 ether;
    uint256 internal constant INITIAL_PDAO_SHARE = 0;

    RocketStorageMock internal store;
    RocketDAOProtocolSettingsNetwork internal settings;
    RocketNetworkRevenues internal revenues;
    RocketNetworkSnapshotsTime internal snapshots;

    function setUp() public {
        vm.warp(START_TIME);

        store = new RocketStorageMock();
        snapshots = new RocketNetworkSnapshotsTime(RocketStorageInterface(address(store)));
        revenues = new RocketNetworkRevenues(RocketStorageInterface(address(store)));
        settings = new RocketDAOProtocolSettingsNetwork(RocketStorageInterface(address(store)));

        store.setAddress(_addressKey("rocketNetworkSnapshotsTime"), address(snapshots));
        store.setAddress(_addressKey("rocketNetworkRevenues"), address(revenues));
        store.setAddress(_addressKey("rocketDAOProtocolSettingsNetwork"), address(settings));
        store.setAddress(_addressKey("rocketDAOProtocolProposals"), address(this));
        store.setBool(_existsKey(address(revenues)), true);
        store.setBool(_existsKey(address(this)), true);
        store.setDeployedStatus(true);

        revenues.initialise(INITIAL_NODE_SHARE, INITIAL_VOTER_SHARE, INITIAL_PDAO_SHARE);
    }

    function testCalculatesTimeWeightedAverageNodeShare() public {
        assertEq(revenues.getCurrentNodeShare(), INITIAL_NODE_SHARE);

        vm.warp(START_TIME + 1);
        _set("network.node.commission.share", 0.10 ether);
        assertEq(revenues.getCurrentNodeShare(), 0.10 ether);

        vm.warp(START_TIME + 3);
        (uint256 nodeShare,,,) = revenues.calculateSplit(uint64(START_TIME));
        assertEq(nodeShare, 0.08333 ether);
    }

    function testCalculatesTimeWeightedAverageProtocolDAOShare() public {
        assertEq(revenues.getCurrentProtocolDAOShare(), INITIAL_PDAO_SHARE);

        vm.warp(START_TIME + 10);
        _set("network.pdao.share", 0.01 ether);
        assertEq(revenues.getCurrentProtocolDAOShare(), 0.01 ether);

        vm.warp(START_TIME + 30);
        (,, uint256 protocolDAOShare,) = revenues.calculateSplit(uint64(START_TIME));
        assertEq(protocolDAOShare, 0.00666 ether);
    }

    function testSecurityCouncilAdderUpdatesNodeAndVoterShares() public {
        uint256 adder = 0.005 ether;
        _set("network.node.commission.share.security.council.adder", adder);

        assertEq(settings.getEffectiveNodeShare(), INITIAL_NODE_SHARE + adder);
        assertEq(revenues.getCurrentNodeShare(), INITIAL_NODE_SHARE + adder);
        assertEq(settings.getEffectiveVoterShare(), INITIAL_VOTER_SHARE - adder);
        assertEq(revenues.getCurrentVoterShare(), INITIAL_VOTER_SHARE - adder);
    }

    function testSecurityCouncilAdderPreservesProtocolDAOShare() public {
        uint256 protocolDAOShare = 0.01 ether;
        uint256 adder = 0.005 ether;
        _set("network.pdao.share", protocolDAOShare);
        _set("network.node.commission.share.security.council.adder", adder);

        assertEq(settings.getEffectiveNodeShare(), INITIAL_NODE_SHARE + adder);
        assertEq(revenues.getCurrentNodeShare(), INITIAL_NODE_SHARE + adder);
        assertEq(settings.getEffectiveVoterShare(), INITIAL_VOTER_SHARE - adder);
        assertEq(revenues.getCurrentVoterShare(), INITIAL_VOTER_SHARE - adder);
        assertEq(settings.getProtocolDAOShare(), protocolDAOShare);
        assertEq(revenues.getCurrentProtocolDAOShare(), protocolDAOShare);
    }

    function testCalculatesTimeWeightedNodeShareAfterAdderUpdate() public {
        assertEq(revenues.getCurrentNodeShare(), INITIAL_NODE_SHARE);

        vm.warp(START_TIME + 1);
        _set("network.node.commission.share.security.council.adder", 0.005 ether);
        assertEq(revenues.getCurrentNodeShare(), 0.055 ether);

        vm.warp(START_TIME + 3);
        (uint256 nodeShare,,,) = revenues.calculateSplit(uint64(START_TIME));
        assertEq(nodeShare, 0.05333 ether);
    }

    function testCurrentTimeReturnsCurrentSplit() public {
        _set("network.pdao.share", 0.01 ether);
        _set("network.node.commission.share.security.council.adder", 0.005 ether);

        (
            uint256 nodeShare,
            uint256 voterShare,
            uint256 protocolDAOShare,
            uint256 rethShare
        ) = revenues.calculateSplit(uint64(block.timestamp));

        assertEq(nodeShare, 0.055 ether);
        assertEq(voterShare, 0.085 ether);
        assertEq(protocolDAOShare, 0.01 ether);
        assertEq(rethShare, 0.85 ether);
    }

    function testFutureStartTimeReverts() public {
        vm.expectRevert("Time must be in the past");
        revenues.calculateSplit(uint64(block.timestamp + 1));
    }

    function testCannotInitialiseTwice() public {
        vm.expectRevert("Already initialised");
        revenues.initialise(INITIAL_NODE_SHARE, INITIAL_VOTER_SHARE, INITIAL_PDAO_SHARE);
    }

    function testUnauthorisedDirectShareUpdatesRevert() public {
        vm.expectRevert("Invalid or outdated network contract");
        revenues.setNodeShare(0.10 ether);

        vm.expectRevert("Invalid or outdated network contract");
        revenues.setVoterShare(0.10 ether);

        vm.expectRevert("Invalid or outdated network contract");
        revenues.setProtocolDAOShare(0.01 ether);
    }

    function _set(string memory _path, uint256 _value) private {
        settings.setSettingUint(_path, _value);
    }

    function _addressKey(string memory _name) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }

    function _existsKey(address _account) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }
}
