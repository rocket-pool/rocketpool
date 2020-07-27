pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../lib/SafeMath.sol";
import "../../types/MinipoolStatus.sol";

// Handles updates to minipool status by trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event MinipoolSetWithdrawable(address indexed minipool, uint256 totalBalance, uint256 nodeBalance, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Submit a minipool withdrawable event
    // Only accepts calls from trusted (oracle) nodes
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance, uint256 _startEpoch, uint256 _endEpoch, uint256 _userStartEpoch) override external
    onlyLatestContract("rocketMinipoolStatus", address(this)) onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Check submission
        checkCanSetMinipoolWithdrawable(_minipoolAddress, _startEpoch, _endEpoch, _userStartEpoch);
        // Load contracts
        RocketNetworkSettingsInterface rocketNetworkSettings = RocketNetworkSettingsInterface(getContractAddress("rocketNetworkSettings"));
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress, _withdrawalBalance, _startEpoch, _endEpoch, _userStartEpoch));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.count", _minipoolAddress, _withdrawalBalance, _startEpoch, _endEpoch, _userStartEpoch));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & set minipool withdrawable
        uint256 calcBase = 1 ether;
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (calcBase.mul(submissionCount).div(rocketNodeManager.getTrustedNodeCount()) >= rocketNetworkSettings.getNodeConsensusThreshold()) {
            setMinipoolWithdrawable(_minipoolAddress, _withdrawalBalance, _startEpoch, _endEpoch, _userStartEpoch);
        }
    }

    // Check a minipool withdrawable event submission
    function checkCanSetMinipoolWithdrawable(address _minipoolAddress, uint256 _startEpoch, uint256 _endEpoch, uint256 _userStartEpoch) private view {
        // Check settings
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        require(rocketMinipoolSettings.getSubmitWithdrawableEnabled(), "Submitting withdrawable status is currently disabled");
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool can only be set as withdrawable while staking");
        // Check epochs
        require(_startEpoch <= _userStartEpoch, "Invalid epochs");
        require(_userStartEpoch <= _endEpoch, "Invalid epochs");
    }

    // Mark a minipool as withdrawable, record its final balance, and mint node operator rewards
    function setMinipoolWithdrawable(address _minipoolAddress, uint256 _withdrawalBalance, uint256 _startEpoch, uint256 _endEpoch, uint256 _userStartEpoch) private {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketNodeETHTokenInterface rocketNodeETHToken = RocketNodeETHTokenInterface(getContractAddress("rocketNodeETHToken"));
        // Initialize minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Mark minipool as withdrawable
        minipool.setWithdrawable(_withdrawalBalance, _startEpoch, _endEpoch, _userStartEpoch);
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
        uint256 stakingStart = minipool.getStakingStartEpoch();
        uint256 stakingEnd = minipool.getStakingEndEpoch();
        uint256 stakingUserStart = minipool.getStakingUserStartEpoch();
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
