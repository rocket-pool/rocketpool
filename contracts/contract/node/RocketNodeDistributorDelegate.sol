pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketNodeDistributorStorageLayout.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/node/RocketNodeDistributorInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";

contract RocketNodeDistributorDelegate is RocketNodeDistributorStorageLayout, RocketNodeDistributorInterface {
    // Import libraries
    using SafeMath for uint256;

    // Events
    event FeesDistributed(address _nodeAddress, uint256 _userAmount, uint256 _nodeAmount, uint256 _time);

    // Constants
    uint8 public constant version = 2;
    uint256 constant calcBase = 1 ether;

    // Precomputed constants
    bytes32 immutable rocketNodeManagerKey;
    bytes32 immutable rocketNodeStakingKey;
    bytes32 immutable rocketTokenRETHKey;

    constructor() {
        // Precompute storage keys
        rocketNodeManagerKey = keccak256(abi.encodePacked("contract.address", "rocketNodeManager"));
        rocketNodeStakingKey = keccak256(abi.encodePacked("contract.address", "rocketNodeStaking"));
        rocketTokenRETHKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRETH"));
        // These values must be set by proxy contract as this contract should only be delegatecalled
        rocketStorage = RocketStorageInterface(address(0));
        nodeAddress = address(0);
    }

    function distribute() override external {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(rocketStorage.getAddress(rocketNodeManagerKey));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(rocketStorage.getAddress(rocketNodeStakingKey));
        address rocketTokenRETH = rocketStorage.getAddress(rocketTokenRETHKey);
        // Get withdrawal address and the node's average node fee
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        uint256 averageNodeFee = rocketNodeManager.getAverageNodeFee(nodeAddress);
        // Get node ETH collateral ratio
        uint256 collateralRatio = rocketNodeStaking.getNodeETHCollateralisationRatio(nodeAddress);
        // Calculate reward split
        uint256 nodeBalance = address(this).balance.div(collateralRatio);
        uint256 userBalance = address(this).balance.sub(nodeBalance);
        uint256 nodeShare = nodeBalance.add(userBalance.mul(averageNodeFee).div(calcBase));
        uint256 userShare = address(this).balance.sub(nodeShare);
        // Transfer user share
        payable(rocketTokenRETH).transfer(userShare);
        // Transfer node share
        (bool success,) = withdrawalAddress.call{value : address(this).balance}("");
        require(success);
        // Emit event
        emit FeesDistributed(nodeAddress, userShare, nodeShare, block.timestamp);
    }
}
