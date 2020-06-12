pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../lib/SafeMath.sol";

// Handles updates to minipool status by trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Mark a minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool(address _minipoolAddress) external onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        minipool.exit();
    }

    // Mark a minipool as withdrawable, record its final balance, and mint node operator rewards
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(address _minipoolAddress, uint256 _withdrawalBalance) external onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Load contracts
        RocketNodeETHTokenInterface rocketNodeETHToken = RocketNodeETHTokenInterface(getContractAddress("rocketNodeETHToken"));
        // Initialize minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Mark minipool as withdrawable and record its final balance
        minipool.withdraw(_withdrawalBalance);
        // Get node reward amount
        uint256 nodeAmount = getNodeRewardAmount(minipool);
        // Mint nETH to minipool contract
        if (nodeAmount > 0) { rocketNodeETHToken.mint(nodeAmount, _minipoolAddress); }
    }

    // Get the node reward amount for a withdrawn minipool
    function getNodeRewardAmount(RocketMinipoolInterface minipool) private view returns (uint256) {
        // Calculation base value
        uint256 calcBase = 1 ether;
        // Get minipool details
        uint256 nodeFee = minipool.getNodeFee();
        uint256 nodeDeposit = minipool.getNodeDepositBalance();
        uint256 startBalance = minipool.getStakingStartBalance();
        uint256 endBalance = minipool.getStakingEndBalance();
        uint256 stakingStart = minipool.getStakingStartBlock();
        uint256 stakingUserStart = minipool.getStakingUserStartBlock();
        uint256 stakingEnd = minipool.getStakingEndBlock();
        if (stakingUserStart == 0) { stakingUserStart = stakingEnd; }
        // Node reward amount
        uint256 nodeAmount = 0;
        // Rewards earned
        if (endBalance > startBalance) {
            // Get total rewards earned
            uint256 rewards = endBalance.sub(startBalance);
            // Calculate total and node-only staking durations
            uint256 stakingDuration = stakingEnd.sub(stakingStart);
            uint256 nodeStakingDuration = stakingUserStart.sub(stakingStart);
            // Apply node-only rewards
            if (nodeStakingDuration > 0) {
                uint256 nodeOnlyRewards = rewards.mul(nodeStakingDuration).div(stakingDuration);
                rewards = rewards.sub(nodeOnlyRewards);
                nodeAmount = nodeAmount.add(nodeOnlyRewards);
            }
            // Apply node share and commission of remaining rewards
            if (rewards > 0) {
                uint256 nodeShare = rewards.mul(nodeDeposit).div(startBalance);
                rewards = rewards.sub(nodeShare);
                uint256 nodeCommission = rewards.mul(nodeFee).div(calcBase);
                nodeAmount = nodeAmount.add(nodeShare).add(nodeCommission);
            }
        }
        // No rewards earned
        else {
            // Deduct losses from node deposit amount
            if (startBalance < nodeDeposit.add(endBalance)) {
                nodeAmount = nodeDeposit.add(endBalance).sub(startBalance);
            }
        }
        // Return
        return nodeAmount;
    }

}
