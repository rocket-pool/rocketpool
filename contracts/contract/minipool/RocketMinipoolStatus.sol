pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../lib/SafeMath.sol";
import "../../types/MinipoolStatus.sol";

// Handles updates to minipool status by trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event MinipoolSetExited(address indexed minipool, uint256 time);
    event MinipoolSetWithdrawable(address indexed minipool, uint256 totalBalance, uint256 nodeBalance, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Submit a minipool exited event
    // Only accepts calls from trusted (oracle) nodes
    function submitMinipoolExited(address _minipoolAddress, uint256 _epoch) override external onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool can only be set as exited while staking");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.exited.submitted.node", msg.sender, _minipoolAddress, _epoch));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.exited.submitted.count", _minipoolAddress, _epoch));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & set minipool exited
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (submissionCount.mul(2) >= rocketNodeManager.getTrustedNodeCount()) { setMinipoolExited(_minipoolAddress); }
    }

    // Mark a minipool as exited
    function setMinipoolExited(address _minipoolAddress) private {
        // Set exited
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        minipool.setExited();
        // Emit set exited event
        emit MinipoolSetExited(_minipoolAddress, now);
    }

    // Submit a minipool withdrawable event
    // Only accepts calls from trusted (oracle) nodes
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance, uint256 _epoch) override external onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(minipool.getStatus() == MinipoolStatus.Exited, "Minipool can only be set as withdrawable while exited");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress, _withdrawalBalance, _epoch));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.count", _minipoolAddress, _withdrawalBalance, _epoch));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & set minipool withdrawable
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (submissionCount.mul(2) >= rocketNodeManager.getTrustedNodeCount()) { setMinipoolWithdrawable(_minipoolAddress, _withdrawalBalance); }
    }

    // Mark a minipool as withdrawable, record its final balance, and mint node operator rewards
    function setMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance) private {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketNodeETHTokenInterface rocketNodeETHToken = RocketNodeETHTokenInterface(getContractAddress("rocketNodeETHToken"));
        // Initialize minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Mark minipool as withdrawable and record its final balance
        minipool.setWithdrawable(_withdrawalBalance);
        // Get node reward amount
        uint256 nodeAmount = getNodeRewardAmount(minipool);
        // Mint nETH to minipool contract
        if (nodeAmount > 0) { rocketNodeETHToken.mint(nodeAmount, _minipoolAddress); }
        // Set minipool withdrawal balances
        rocketMinipoolManager.setMinipoolWithdrawalBalances(_minipoolAddress, _withdrawalBalance, nodeAmount);
        // Emit set withdrawable event
        emit MinipoolSetWithdrawable(_minipoolAddress, _withdrawalBalance, nodeAmount, now);
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
            // Apply node deposit amount
            nodeAmount = nodeDeposit;
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
