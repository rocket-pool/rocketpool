// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNodeDistributorInterface} from "../../interface/node/RocketNodeDistributorInterface.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {RocketNodeDistributorStorageLayout} from "./RocketNodeDistributorStorageLayout.sol";

/// @dev Contains the logic for RocketNodeDistributors
contract RocketNodeDistributorDelegate is RocketNodeDistributorStorageLayout, RocketNodeDistributorInterface {
    // Events
    event FeesDistributed(address _nodeAddress, uint256 _userAmount, uint256 _nodeAmount, uint256 _time);

    // Constants
    uint8 public constant version = 3;
    uint256 internal constant calcBase = 1 ether;
    uint256 internal constant NOT_ENTERED = 1;
    uint256 internal constant ENTERED = 2;

    // Precomputed constants
    bytes32 internal constant rocketNodeManagerKey = keccak256(abi.encodePacked("contract.address", "rocketNodeManager"));
    bytes32 internal constant rocketNodeStakingKey = keccak256(abi.encodePacked("contract.address", "rocketNodeStaking"));
    bytes32 internal constant rocketTokenRETHKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRETH"));

    modifier nonReentrant() {
        require(lock != ENTERED, "Reentrant call");
        lock = ENTERED;
        _;
        lock = NOT_ENTERED;
    }

    constructor() {
        // These values must be set by proxy contract as this contract should only be delegatecalled
        rocketStorage = RocketStorageInterface(address(0));
        nodeAddress = address(0);
        lock = NOT_ENTERED;
    }

    /// @notice Returns the portion of the contract's balance that belongs to the node operator
    function getNodeShare() override public view returns (uint256) {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(rocketStorage.getAddress(rocketNodeManagerKey));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(rocketStorage.getAddress(rocketNodeStakingKey));
        // Get withdrawal address and the node's average node fee
        uint256 averageNodeFee = rocketNodeManager.getAverageNodeFee(nodeAddress);
        // Get node ETH collateral ratio
        uint256 collateralRatio = rocketNodeStaking.getNodeETHCollateralisationRatio(nodeAddress);
        // Calculate reward split
        uint256 nodeBalance = address(this).balance * calcBase / collateralRatio;
        uint256 userBalance = address(this).balance - nodeBalance;
        return nodeBalance + (userBalance * averageNodeFee / calcBase);
    }

    /// @notice Returns the portion of the contract's balance that belongs to the users
    function getUserShare() override external view returns (uint256) {
        return address(this).balance - getNodeShare();
    }

    /// @notice Distributes the balance of this contract to its owners
    function distribute() override external nonReentrant {
        // Calculate node share
        uint256 nodeShare = getNodeShare();
        // Transfer node share
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        if (msg.sender == nodeAddress || msg.sender == withdrawalAddress) {
            // If called by node operator, transfer directly
            (bool success,) = withdrawalAddress.call{value: nodeShare}("");
            require(success, "Failed to send funds to withdrawal address");
        } else {
            // If not called by node operator, add to unclaimed balance for later claiming
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(rocketStorage.getAddress(rocketNodeManagerKey));
            rocketNodeManager.addUnclaimedRewards{value: nodeShare}(nodeAddress);
        }
        // Transfer user share
        uint256 userShare = address(this).balance;
        address rocketTokenRETH = rocketStorage.getAddress(rocketTokenRETHKey);
        payable(rocketTokenRETH).transfer(userShare);
        // Emit event
        emit FeesDistributed(nodeAddress, userShare, nodeShare, block.timestamp);
    }
}
