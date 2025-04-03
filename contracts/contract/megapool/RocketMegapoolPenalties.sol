// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketDAONodeTrustedInterface} from "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolPenaltiesInterface} from "../../interface/megapool/RocketMegapoolPenaltiesInterface.sol";

/// @notice Performs deterministic deployment of megapool delegate contracts and handles deprecation of old ones
contract RocketMegapoolPenalties is RocketBase, RocketMegapoolPenaltiesInterface {
    // Constants
    uint256 constant internal penaltyMaximumPeriod = 50400;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    /// @dev Returns the number of votes in favour of the given penalty
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function getVoteCount(address _megapool, uint256 _block, uint256 _amount) override external view returns (uint256) {
        bytes32 submissionCountKey = keccak256(abi.encodePacked("megapool.penalty.submission", _megapool, _block, _amount));
        return getUint(submissionCountKey);
    }

    /// @dev Votes to penalise a megapool for MEV theft (only callable by oDAO)
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function penalise(address _megapool, uint256 _block, uint256 _amount) override external onlyTrustedNode(msg.sender) {
        // Check this penalty hasn't already reach majority and been applied
        bytes32 penaltyAppliedKey = keccak256(abi.encodePacked("megapool.penalty.submission.applied", _megapool, _block, _amount));
        require(!getBool(penaltyAppliedKey), "Penalty already applied");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("megapool.penalty.submission", msg.sender, _megapool, _block, _amount));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("megapool.penalty.submission", _megapool, _block, _amount));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey) + 1;
        setUint(submissionCountKey, submissionCount);
        // Check for majority
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase * submissionCount / rocketDAONodeTrusted.getMemberCount() > 0.5 ether) {
            // Apply penalty and mark as applied
            applyPenalty(_megapool, _amount);
            setBool(penaltyAppliedKey, true);
        }
    }

    function getPenaltyRunningTotalAtBlock(address _megapool, uint32 _block) override external view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 penaltyKey = keccak256(abi.encodePacked("megapool.running.penalty", _megapool));
        return rocketNetworkSnapshots.lookup(penaltyKey, _block);
    }

    function getCurrentPenaltyRunningTotal(address _megapool) override external view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 penaltyKey = keccak256(abi.encodePacked("megapool.running.penalty", _megapool));
        (,,uint224 value) =  rocketNetworkSnapshots.latest(penaltyKey);
        return uint256(value);
    }

    function getCurrentMaxPenalty(address _megapool) override external view returns (uint256) {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
        // Precompute storage key
        bytes32 penaltyKey = keccak256(abi.encodePacked("megapool.running.penalty", _megapool));
        // Get running total from 50400 slots ago
        uint256 earlierBlock = 0;
        if (block.number > penaltyMaximumPeriod) {
            earlierBlock = block.number - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = rocketNetworkSnapshots.lookupRecent(penaltyKey, uint32(earlierBlock), 5);
        // Get current running total
        (bool exists, uint32 slot, uint224 value) = rocketNetworkSnapshots.latest(penaltyKey);
        uint256 currentTotal = 0;
        if (exists) {
            currentTotal = value;
        }
        // Cap the penalty at the maximum amount based on past 50400 blocks
        return maxPenalty - (currentTotal - earlierRunningTotal);
    }

    /// @dev Applies a penalty up to given amount, honouring the max penalty parameter
    function applyPenalty(address _megapool, uint256 _amount) internal {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
        // Precompute storage key
        bytes32 penaltyKey = keccak256(abi.encodePacked("megapool.running.penalty", _megapool));
        // Get running total from 50400 slots ago
        uint256 earlierBlock = 0;
        if (block.number > penaltyMaximumPeriod) {
            earlierBlock = block.number - penaltyMaximumPeriod;
        }
        uint256 earlierRunningTotal = rocketNetworkSnapshots.lookupRecent(penaltyKey, uint32(earlierBlock), 5);
        // Get current running total
        (bool exists, uint32 slot, uint224 value) = rocketNetworkSnapshots.latest(penaltyKey);
        uint256 currentTotal = 0;
        if (exists) {
            currentTotal = value;
        }
        // Cap the penalty at the maximum amount based on past 50400 blocks
        uint256 maxCurrentPenalty = maxPenalty - (currentTotal - earlierRunningTotal);
        if (_amount > maxCurrentPenalty) {
            _amount = maxCurrentPenalty;
        }
        // Prevent useless penalty
        require(_amount > 0, "No penalty to apply");
        // Insert new running total
        rocketNetworkSnapshots.push(penaltyKey, uint224(currentTotal + _amount));
        // Call megapool to increase debt
        RocketMegapoolDelegateInterface(_megapool).applyPenalty(_amount);
    }
}
