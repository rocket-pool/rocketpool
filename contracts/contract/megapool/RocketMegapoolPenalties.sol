// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketDAONodeTrustedInterface} from "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolPenaltiesInterface} from "../../interface/megapool/RocketMegapoolPenaltiesInterface.sol";
import {RocketNetworkSnapshotsTimeInterface} from "../../interface/network/RocketNetworkSnapshotsTimeInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

/// @notice Applies penalties to megapools for MEV theft
contract RocketMegapoolPenalties is RocketBase, RocketMegapoolPenaltiesInterface {
    // Constants
    uint256 constant internal penaltyMaximumPeriod = 7 days;
    bytes32 constant internal penaltyKey = keccak256(abi.encodePacked("megapool.running.penalty"));

    // Events
    event PenaltySubmitted(address indexed from, address megapool, uint256 block, uint256 amount, uint256 time);
    event PenaltyApplied(address indexed megapool, uint256 block, uint256 amount, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the number of votes in favour of the given penalty
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function getVoteCount(address _megapool, uint256 _block, uint256 _amount) override external view returns (uint256) {
        bytes32 submissionCountKey = keccak256(abi.encodePacked("megapool.penalty.submission", _megapool, _block, _amount));
        return getUint(submissionCountKey);
    }

    /// @notice Votes to penalise a megapool for MEV theft (only callable by oDAO)
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function penalise(address _megapool, uint256 _block, uint256 _amount) override external onlyTrustedNode(msg.sender) onlyRegisteredMegapool(_megapool) {
        require(_amount > 0, "Invalid penalty amount");
        require(_block < block.number, "Invalid block number");
        // Sanity check amount does not exceed max penalty
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
        require(_amount <= maxPenalty, "Penalty exceeds maximum");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("megapool.penalty.submission", msg.sender, _megapool, _block, _amount));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("megapool.penalty.submission", _megapool, _block, _amount));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey) + 1;
        setUint(submissionCountKey, submissionCount);
        // Maybe execute
        _maybeApplyPenalty(_megapool, _block, _amount, submissionCount);
        // Emit event
        emit PenaltySubmitted(msg.sender, _megapool, _block, _amount, block.timestamp);
    }

    /// @notice Manually execute a penalty that has hit majority vote
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function executePenalty(address _megapool, uint256 _block, uint256 _amount) override external {
        // Get submission count
        bytes32 submissionCountKey = keccak256(abi.encodePacked("megapool.penalty.submission", _megapool, _block, _amount));
        uint256 submissionCount = getUint(submissionCountKey);
        // Apply penalty if relevant conditions are met
        _maybeApplyPenalty(_megapool, _block, _amount, submissionCount);
    }

    /// @notice Returns the running total of penalties at a given time
    /// @param _time The time to compute running total for
    function getPenaltyRunningTotalAtTime(uint64 _time) override external view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshots = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        return rocketNetworkSnapshots.lookup(penaltyKey, _time);
    }

    /// @notice Returns the running total of penalties at the current block
    function getCurrentPenaltyRunningTotal() override external view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        (,,uint192 value) =  rocketNetworkSnapshotsTime.latest(penaltyKey);
        return uint256(value);
    }

    /// @notice Returns the current maximum penalty based on the running total limitation
    function getCurrentMaxPenalty() override external view returns (uint256) {
        // Get contracts
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
        // Get running total from 7 days ago
        uint256 earlierTime = 0;
        if (block.timestamp > penaltyMaximumPeriod) {
            earlierTime = block.timestamp - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = uint256(rocketNetworkSnapshotsTime.lookup(penaltyKey, uint64(earlierTime)));
        // Get current running total
        (,, uint192 currentRunningTotal) = rocketNetworkSnapshotsTime.latest(penaltyKey);
        // Cap the penalty at the maximum amount based on past 7 days
        uint256 currentTotal = uint256(currentRunningTotal) - earlierRunningTotal;
        if (currentTotal > maxPenalty) return 0;
        return maxPenalty - currentTotal;
    }

    /// @dev If a penalty has not been applied and hit majority, execute the penalty
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function _maybeApplyPenalty(address _megapool, uint256 _block, uint256 _amount, uint256 _submissionCount) internal {
        // Check this penalty hasn't already reach majority and been applied
        bytes32 penaltyAppliedKey = keccak256(abi.encodePacked("megapool.penalty.submission.applied", _megapool, _block, _amount));
        require(!getBool(penaltyAppliedKey), "Penalty already applied");
        // Check for majority
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        if (calcBase * _submissionCount / rocketDAONodeTrusted.getMemberCount() >= rocketDAOProtocolSettingsMegapool.getPenaltyThreshold()) {
            // Apply penalty and mark as applied
            _applyPenalty(_megapool, _amount);
            setBool(penaltyAppliedKey, true);
            // Emit event
            emit PenaltyApplied(_megapool, _block, _amount, block.timestamp);
        }
    }

    /// @dev Applies a penalty up to given amount, honouring the max penalty parameter
    function _applyPenalty(address _megapool, uint256 _amount) internal {
        // Get contracts
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
        // Get running total from 7 days ago
        uint256 earlierTime = 0;
        if (block.timestamp > penaltyMaximumPeriod) {
            earlierTime = block.timestamp - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = rocketNetworkSnapshotsTime.lookup(penaltyKey, uint32(earlierTime));
        // Get current running total
        (,, uint192 currentRunningTotal) = rocketNetworkSnapshotsTime.latest(penaltyKey);
        // Prevent the running penalty total from exceeding the maximum amount
        uint256 currentTotal = uint256(currentRunningTotal) - earlierRunningTotal;
        require(currentTotal < maxPenalty, "Max penalty exceeded");
        uint256 currentMaxPenalty = maxPenalty - currentTotal;
        require(_amount <= currentMaxPenalty, "Max penalty exceeded");
        // Insert new running total
        rocketNetworkSnapshotsTime.push(penaltyKey, currentRunningTotal + uint192(_amount));
        // Call megapool to increase debt
        RocketMegapoolDelegateInterface(_megapool).applyPenalty(_amount);
    }
}
