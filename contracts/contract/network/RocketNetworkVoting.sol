// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "@openzeppelin4/contracts/utils/math/Math.sol";

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {RocketDAOProtocolSettingsNodeInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import {RocketNetworkPricesInterface} from "../../interface/network/RocketNetworkPricesInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import {AddressSetStorageInterface} from "../../interface/util/AddressSetStorageInterface.sol";
import {RocketNetworkVotingInterface} from "../../interface/network/RocketNetworkVotingInterface.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";

/// @notice Accounting for snapshotting of governance related values based on block numbers
contract RocketNetworkVoting is RocketBase, RocketNetworkVotingInterface {
    // Constants
    bytes32 immutable internal priceKey = keccak256("network.prices.rpl");

    // Events
    event DelegateSet(address nodeOperator, address delegate, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
    }

    /// @notice Returns the number of registered nodes at a given block
    /// @param _block Block number to query
    function getNodeCount(uint32 _block) external override view returns (uint256) {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.count"));
        return uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 10));
    }

    /// @notice Returns the voting power of a given node operator at a specified block
    /// @param _nodeAddress Address of the node operator
    /// @param _block Block number to query
    function getVotingPower(address _nodeAddress, uint32 _block) external override view returns (uint256) {
        // Validate block number
        require(_block <= block.number, "Block must be in the past");

        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));

        // Setup
        bytes32 key;

        // Get ETH borrowed (minipools)
        key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        uint256 borrowedETH = uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 5));

        // Get active minipools to calculate borrowed ETH
        key = keccak256(abi.encodePacked("minipools.active.count", _nodeAddress));
        uint256 activeMinipools = rocketNetworkSnapshots.lookupRecent(key, _block, 5);

        // Get total megapool bonded ETH
        key = keccak256(abi.encodePacked("megapool.eth.provided.node.amount", _nodeAddress));
        uint256 megapoolETHBonded = rocketNetworkSnapshots.lookupRecent(key, _block, 5);

        // Calculate total bonded ETH
        uint256 totalETHStaked = (activeMinipools * 32 ether);
        uint256 bondedETH = totalETHStaked - borrowedETH + megapoolETHBonded;

        // Get RPL price
        uint256 rplPrice = uint256(rocketNetworkSnapshots.lookupRecent(priceKey, _block, 14));

        // Get RPL staked by node operator
        key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        uint256 rplStake = uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 5));

        // Get RPL max stake percent
        key = keccak256(bytes("node.voting.power.stake.maximum"));
        uint256 maximumStakePercent = uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 2));

        return calculateVotingPower(rplStake, bondedETH, rplPrice, maximumStakePercent);
    }

    /// @dev Calculates and returns a node's voting power based on the given inputs
    /// @param _rplStake Total RPL staked by a node (megapool + legacy staked RPL)
    /// @param _bondedETH Sum total of a node's bonded ETH
    /// @param _rplPrice The price of RPL in ETH
    /// @param _maxStakePercent The maximum RPL percentage that counts towards voting power
    function calculateVotingPower(uint256 _rplStake, uint256 _bondedETH, uint256 _rplPrice, uint256 _maxStakePercent) internal pure returns (uint256) {
        // Get contracts
        uint256 maximumStake = _bondedETH * _maxStakePercent / _rplPrice;
        if (_rplStake > maximumStake) {
            _rplStake = maximumStake;
        }
        // Return the calculated voting power as the square root of clamped RPL stake
        return Math.sqrt(_rplStake * calcBase);
    }

    /// @notice Called by a registered node to set their delegate address
    /// @param _newDelegate The address of the node operator to delegate voting power to
    function setDelegate(address _newDelegate) external override onlyRegisteredNode(msg.sender) onlyRegisteredNode(_newDelegate) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", msg.sender));
        rocketNetworkSnapshots.push(key, uint224(uint160(_newDelegate)));
        emit DelegateSet(msg.sender, _newDelegate, block.timestamp);
    }

    /// @notice Returns the address of the node operator that the given node operator has delegated to at a given block
    /// @param _nodeAddress Address of the node operator to query
    /// @param _block The block number to query
    function getDelegate(address _nodeAddress, uint32 _block) external override view returns (address) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", _nodeAddress));
        return address(uint160(rocketNetworkSnapshots.lookupRecent(key, _block, 10)));
    }

    /// @notice Returns the address of the node operator that the given node operator is currently delegate to
    /// @param _nodeAddress Address of the node operator to query
    function getCurrentDelegate(address _nodeAddress) external override view returns (address) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", _nodeAddress));
        return address(uint160(rocketNetworkSnapshots.latestValue(key)));
    }
}
