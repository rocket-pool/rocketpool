pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../types/MinipoolStatus.sol";

// Handles updates to minipool status by trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Libs
    using SafeMath for uint;

    // Calculate using this as the base
    uint256 constant calcBase = 1 ether;

    // Events
    event MinipoolWithdrawableSubmitted(address indexed from, address indexed minipool, uint256 stakingStartBalance, uint256 stakingEndBalance, uint256 time);
    event MinipoolSetWithdrawable(address indexed minipool, uint256 totalBalance, uint256 nodeBalance, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Submit a minipool withdrawable event
    // Only accepts calls from trusted (oracle) nodes
    // _stakingStartBalance is the validator balance at the time of the user deposit if assigned, or the balance at activation_epoch
    // _stakingEndBalance is the validator balance at withdrawable_epoch
    function submitMinipoolWithdrawable(address _minipoolAddress, uint256 _stakingStartBalance, uint256 _stakingEndBalance) override external
    onlyLatestContract("rocketMinipoolStatus", address(this)) onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Check settings
        require(rocketDAOProtocolSettingsMinipool.getSubmitWithdrawableEnabled(), "Submitting withdrawable status is currently disabled");
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool can only be set as withdrawable while staking");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress, _stakingStartBalance, _stakingEndBalance));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.count", _minipoolAddress, _stakingStartBalance, _stakingEndBalance));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit minipool withdrawable status submitted event
        emit MinipoolWithdrawableSubmitted(msg.sender, _minipoolAddress, _stakingStartBalance, _stakingEndBalance, block.timestamp);
        // Check submission count & set minipool withdrawable
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            setMinipoolWithdrawable(_minipoolAddress, _stakingStartBalance, _stakingEndBalance);
        }
    }

    // Mark a minipool as withdrawable, record its final balance, and mint node operator rewards
    function setMinipoolWithdrawable(address _minipoolAddress, uint256 _stakingStartBalance, uint256 _stakingEndBalance) private {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Initialize minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Mark minipool as withdrawable
        minipool.setWithdrawable(_stakingStartBalance, _stakingEndBalance);
        // Get minipool data
        uint256 userDepositBalance = minipool.getUserDepositBalance();
        // Get node reward amount
        uint256 nodeAmount = getMinipoolNodeRewardAmount(
            minipool.getNodeFee(),
            userDepositBalance,
            minipool.getStakingStartBalance(),
            minipool.getStakingEndBalance()
        );
        // Set minipool withdrawal balances
        rocketMinipoolManager.setMinipoolWithdrawalBalances(_minipoolAddress, _stakingEndBalance, nodeAmount);
        // Apply node penalties by liquidating RPL stake
        if (_stakingEndBalance < userDepositBalance) {
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            rocketNodeStaking.slashRPL(minipool.getNodeAddress(), userDepositBalance - _stakingEndBalance);
        }
        // Emit set withdrawable event
        emit MinipoolSetWithdrawable(_minipoolAddress, _stakingEndBalance, nodeAmount, block.timestamp);
    }

    // Calculate the node reward amount for a minipool by node fee, user deposit balance, and staking start & end balances
    // _startBalance is the validator balance at the time of the user deposit if assigned, or the balance at activation_epoch
    // _endBalance is the validator balance at withdrawable_epoch or a specified epoch
    function getMinipoolNodeRewardAmount(uint256 _nodeFee, uint256 _userDepositBalance, uint256 _startBalance, uint256 _endBalance) override public pure returns (uint256) {
        // Node reward amount
        uint256 nodeAmount = 0;
        // Calculate node balance at time of user deposit
        uint256 nodeBalance = 0;
        if (_startBalance > _userDepositBalance) {
            nodeBalance = _startBalance.sub(_userDepositBalance);
        }
        // Rewards earned
        if (_endBalance > _startBalance) {
            // Calculate rewards earned
            uint256 rewards = _endBalance.sub(_startBalance);
            // Calculate node share of rewards
            uint256 nodeShare = rewards.mul(nodeBalance).div(_startBalance);
            rewards = rewards.sub(nodeShare);
            // Calculate node commission on user share of rewards
            uint256 nodeCommission = rewards.mul(_nodeFee).div(calcBase);
            // Update node reward amount
            nodeAmount = nodeBalance.add(nodeShare).add(nodeCommission);
        }
        // No rewards earned
        else {
            // Deduct losses from node balance
            if (_startBalance < nodeBalance.add(_endBalance)) {
                nodeAmount = nodeBalance.add(_endBalance).sub(_startBalance);
            }
        }
        // Return
        return nodeAmount;
    }

}
