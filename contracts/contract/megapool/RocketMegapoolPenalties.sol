// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketDAONodeTrustedInterface} from "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolPenaltiesInterface} from "../../interface/megapool/RocketMegapoolPenaltiesInterface.sol";

/// @notice Applies penalties to megapools for MEV theft
contract RocketMegapoolPenalties is RocketBase, RocketMegapoolPenaltiesInterface {
    // Constants
    uint256 constant internal penaltyMaximumPeriod = 50400;
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
        maybeApplyPenalty(_megapool, _block, _amount, submissionCount);
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
        maybeApplyPenalty(_megapool, _block, _amount, submissionCount);
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
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
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
    /// @param _megapool Address of the accused megapool
    /// @param _block Block that the theft occurred (used for uniqueness)
    /// @param _amount Amount in ETH of the penalty
    function maybeApplyPenalty(address _megapool, uint256 _block, uint256 _amount, uint256 _submissionCount) internal {
        // Check this penalty hasn't already reach majority and been applied
        bytes32 penaltyAppliedKey = keccak256(abi.encodePacked("megapool.penalty.submission.applied", _megapool, _block, _amount));
        require(!getBool(penaltyAppliedKey), "Penalty already applied");
        // Check for majority
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase * _submissionCount / rocketDAONodeTrusted.getMemberCount() > 0.5 ether) {
            // Apply penalty and mark as applied
            applyPenalty(_megapool, _amount);
            setBool(penaltyAppliedKey, true);
            // Emit event
            emit PenaltyApplied(_megapool, _block, _amount, block.timestamp);
        }
    }

    /// @dev Applies a penalty up to given amount, honouring the max penalty parameter
    function applyPenalty(address _megapool, uint256 _amount) internal {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        // Grab max weekly penalty
        uint256 maxPenalty = rocketDAOProtocolSettingsMegapool.getMaximumEthPenalty();
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
        require(_amount <= currentMaxPenalty, "Max penalty exceeded");
        // Insert new running total
        rocketNetworkSnapshots.push(penaltyKey, currentRunningTotal + uint224(_amount));
        // Call megapool to increase debt
        RocketMegapoolDelegateInterface(_megapool).applyPenalty(_amount);
    }
}
