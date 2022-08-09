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

    // Events
    event MinipoolWithdrawableSubmitted(address indexed from, address indexed minipool, uint256 time);
    event MinipoolSetWithdrawable(address indexed minipool, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Submit a minipool withdrawable event
    // Only accepts calls from trusted (oracle) nodes
    function submitMinipoolWithdrawable(address _minipoolAddress) override external
    onlyLatestContract("rocketMinipoolStatus", address(this)) onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipoolAddress) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Check settings
        require(rocketDAOProtocolSettingsMinipool.getSubmitWithdrawableEnabled(), "Submitting withdrawable status is currently disabled");
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        MinipoolStatus status = minipool.getStatus()
        require(status == MinipoolStatus.Staking || status == MinipoolStatus.RequestedWithdrawable, "Minipool can only be set as withdrawable while staking or requested withdrawable");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.count", _minipoolAddress));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("minipool.withdrawable.submitted.node", msg.sender, _minipoolAddress)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit minipool withdrawable status submitted event
        emit MinipoolWithdrawableSubmitted(msg.sender, _minipoolAddress, block.timestamp);
        // Check submission count & set minipool withdrawable
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            setMinipoolWithdrawable(_minipoolAddress);
        }
    }

    // Executes updateBalances if consensus threshold is reached
    function executeMinipoolWithdrawable(address _minipoolAddress) override external
    onlyLatestContract("rocketMinipoolStatus", address(this)) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Check settings
        require(rocketDAOProtocolSettingsMinipool.getSubmitWithdrawableEnabled(), "Submitting withdrawable status is currently disabled");
        // Check minipool status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        MinipoolStatus status = minipool.getStatus()
        require(status == MinipoolStatus.Staking || status == MinipoolStatus.RequestedWithdrawable, "Minipool can only be set as withdrawable while staking or requested withdrawable");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.withdrawable.submitted.count", _minipoolAddress));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & set minipool withdrawable
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require(calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        setMinipoolWithdrawable(_minipoolAddress);
    }

    // Mark a minipool as withdrawable, record its final balance, and mint node operator rewards
    function setMinipoolWithdrawable(address _minipoolAddress) private {
        // Initialize minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Mark minipool as withdrawable
        minipool.setWithdrawable();
        // Emit set withdrawable event
        emit MinipoolSetWithdrawable(_minipoolAddress, block.timestamp);
    }

}
