// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketDAONodeTrustedInterface} from "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketMinipoolPenaltyInterface} from "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";
import {RocketNetworkPenaltiesInterface} from "../../interface/network/RocketNetworkPenaltiesInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";

/// @notice Applies penalties to minipools for MEV theft
contract RocketNetworkPenalties is RocketBase, RocketNetworkPenaltiesInterface {
    // Constants
    uint256 constant internal penaltyMaximumPeriod = 50400;
    bytes32 constant internal penaltyKey = keccak256(abi.encodePacked("minipool.running.penalty"));

    // Events
    event PenaltySubmitted(address indexed from, address indexed minipool, uint256 block, uint256 time);
    event PenaltyApplied(address indexed minipool, uint256 block, uint256 time);
    event PenaltyUpdated(address indexed minipool, uint256 penalty, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Returns the number of votes in favour of the given penalty
    /// @param _minipool Address of the accused minipool
    /// @param _block Block that the theft occurred (used for uniqueness)
    function getVoteCount(address _minipool, uint256 _block) override external view returns (uint256) {
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.penalty.submission", _minipool, _block));
        return getUint(submissionCountKey);
    }

    /// @notice Votes to penalise a minipool for MEV theft (only callable by oDAO)
    /// @param _minipool Address of the accused minipool
    /// @param _block Block that the theft occurred (used for uniqueness)
    function submitPenalty(address _minipool, uint256 _block) override external onlyTrustedNode(msg.sender) onlyRegisteredMinipool(_minipool) {
        require(_block < block.number, "Invalid block number");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("minipool.penalty.submission", msg.sender, _minipool, _block));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.penalty.submission", _minipool, _block));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey) + 1;
        setUint(submissionCountKey, submissionCount);
        // Maybe execute
        maybeApplyPenalty(_minipool, _block, submissionCount);
        // Emit event
        emit PenaltySubmitted(msg.sender, _minipool, _block, block.timestamp);
    }

    /// @notice Manually execute a penalty that has hit majority vote
    /// @param _minipool Address of the accused minipool
    /// @param _block Block that the theft occurred (used for uniqueness)
    function executeUpdatePenalty(address _minipool, uint256 _block) override external {
        // Get submission count
        bytes32 submissionCountKey = keccak256(abi.encodePacked("minipool.penalty.submission", _minipool, _block));
        uint256 submissionCount = getUint(submissionCountKey);
        // Apply penalty if relevant conditions are met
        maybeApplyPenalty(_minipool, _block, submissionCount);
    }

    /// @notice Returns the running total of penalties at a given block
    /// @param _block The block to compute running total for
    function getPenaltyRunningTotalAtBlock(uint32 _block) override external view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        return rocketNetworkSnapshots.lookup(penaltyKey, _block);
    }

    /// @notice Returns the running total of penalties at the current block
    function getCurrentPenaltyRunningTotal() override external view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        (,,uint224 value) =  rocketNetworkSnapshots.latest(penaltyKey);
        return uint256(value);
    }

    /// @notice Returns the current maximum penalty based on the running total limitation
    function getCurrentMaxPenalty() override external view returns (uint256) {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMinipool.getMaximumPenaltyCount();
        // Get running total from 50400 slots ago
        uint256 earlierBlock = 0;
        if (block.number > penaltyMaximumPeriod) {
            earlierBlock = block.number - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = uint256(rocketNetworkSnapshots.lookup(penaltyKey, uint32(earlierBlock)));
        // Get current running total
        (,, uint224 currentRunningTotal) = rocketNetworkSnapshots.latest(penaltyKey);
        // Cap the penalty at the maximum amount based on past 50400 blocks
        uint256 currentTotal = uint256(currentRunningTotal) - earlierRunningTotal;
        if (currentTotal > maxPenalty) return 0;
        return maxPenalty - currentTotal;
    }

    /// @dev If a penalty has not been applied and hit majority, execute the penalty
    /// @param _minipool Address of the accused minipool
    /// @param _block Block that the theft occurred (used for uniqueness)
    function maybeApplyPenalty(address _minipool, uint256 _block, uint256 _submissionCount) internal {
        // Check this penalty hasn't already reach majority and been applied
        bytes32 penaltyAppliedKey = keccak256(abi.encodePacked("minipool.penalty.submission.applied", _minipool, _block));
        require(!getBool(penaltyAppliedKey), "Penalty already applied");
        // Check for majority
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        if (calcBase * _submissionCount / rocketDAONodeTrusted.getMemberCount() > rocketDAOProtocolSettingsNetwork.getNodePenaltyThreshold()) {
            // Apply penalty and mark as applied
            setBool(penaltyAppliedKey, true);
            applyPenalty(_minipool);
            // Emit event
            emit PenaltyApplied(_minipool, _block, block.timestamp);
        }
    }

    /// @dev Applies a penalty up to given amount, honouring the max penalty parameter
    function applyPenalty(address _minipool) internal {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMinipool.getMaximumPenaltyCount();
        // Get running total from 50400 slots ago
        uint256 earlierBlock = 0;
        if (block.number > penaltyMaximumPeriod) {
            earlierBlock = block.number - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = rocketNetworkSnapshots.lookup(penaltyKey, uint32(earlierBlock));
        // Get current running total
        (,, uint224 currentRunningTotal) = rocketNetworkSnapshots.latest(penaltyKey);
        // Prevent the running penalty total from exceeding the maximum amount
        uint256 currentTotal = uint256(currentRunningTotal) - earlierRunningTotal;
        require(currentTotal < maxPenalty, "Max penalty exceeded");
        uint256 currentMaxPenalty = maxPenalty - currentTotal;
        require(currentMaxPenalty > 0, "Max penalty exceeded");
        // Insert new running total
        rocketNetworkSnapshots.push(penaltyKey, currentRunningTotal + 1);
        // Increment the penalty count on this minipool
        incrementMinipoolPenaltyCount(_minipool);
    }

    /// @notice Returns the number of penalties for a given minipool
    /// @param _minipool Address of the minipool to query
    function getPenaltyCount(address _minipool) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("network.penalties.penalty", _minipool)));
    }

    /// @dev Increments the number of penalties against given minipool and updates penalty rate appropriately
    function incrementMinipoolPenaltyCount(address _minipool) internal {
        // Get contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Calculate penalty count key
        bytes32 key = keccak256(abi.encodePacked("network.penalties.penalty", _minipool));
        // Get the current penalty count
        uint256 newPenaltyCount = getUint(key) + 1;
        // Update the penalty count
        setUint(key, newPenaltyCount);
        // First two penalties do not increase penalty rate
        if (newPenaltyCount < 3) {
            return;
        }
        newPenaltyCount = newPenaltyCount - 2;
        // Calculate the new penalty rate
        uint256 penaltyRate = newPenaltyCount * rocketDAOProtocolSettingsNetwork.getPerPenaltyRate();
        // Set the penalty rate
        RocketMinipoolPenaltyInterface rocketMinipoolPenalty = RocketMinipoolPenaltyInterface(getContractAddress("rocketMinipoolPenalty"));
        rocketMinipoolPenalty.setPenaltyRate(_minipool, penaltyRate);
        // Emit penalty updated event
        emit PenaltyUpdated(_minipool, penaltyRate, block.timestamp);
    }
}
