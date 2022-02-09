pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketNodeDistributorStorageLayout.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/node/RocketNodeDistributorInterface.sol";

contract RocketNodeDistributorDelegate is RocketNodeDistributorStorageLayout, RocketNodeDistributorInterface {
    // Import libraries
    using SafeMath for uint256;

    bytes32 immutable rocketNodeManagerKey;
    bytes32 immutable rocketTokenRETHKey;

    constructor() {
        // Precompute storage keys
        rocketNodeManagerKey = keccak256(abi.encodePacked("contract.address", "rocketNodeManager"));
        rocketTokenRETHKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRETH"));
    }

    function distribute() override external {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(rocketStorage.getAddress(rocketNodeManagerKey));
        address rocketTokenRETH = rocketStorage.getAddress(rocketTokenRETHKey);
        // Get withdrawal address and the node's average node fee
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        uint256 averageNodeFee = rocketNodeManager.getAverageNodeFee(nodeAddress);
        // Calculate what portion of the balance is the node's
        uint256 halfBalance = address(this).balance.div(2);
        uint256 nodeShare = halfBalance.add(halfBalance.mul(averageNodeFee).div(1 ether));
        // Transfer user share
        payable(rocketTokenRETH).transfer(address(this).balance.sub(nodeShare));
        // Transfer node share
        (bool success,) = withdrawalAddress.call{value: address(this).balance}("");
        require(success);
    }
}
