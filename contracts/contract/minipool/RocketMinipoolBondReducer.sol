// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolBondReducerInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";

/// @notice Handles bond reduction window and trusted node cancellation
contract RocketMinipoolBondReducer is RocketBase, RocketMinipoolBondReducerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BeginBondReduction(address indexed minipool, uint256 newBondAmount, uint256 time);
    event CancelReductionVoted(address indexed minipool, address indexed member, uint256 time);
    event ReductionCancelled(address indexed minipool, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Flags a minipool as wanting to reduce collateral, owner can then call `reduceBondAmount` once waiting
    ///         period has elapsed
    /// @param _minipoolAddress Address of the minipool
    /// @param _newBondAmount The new bond amount
    function beginReduceBondAmount(address _minipoolAddress, uint256 _newBondAmount) override external onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        // Only minipool owner can call
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(msg.sender == minipool.getNodeAddress(), "Only minipool owner");
        // Get contracts
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        RocketDAOProtocolSettingsRewardsInterface daoSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        RocketDAOProtocolSettingsMinipoolInterface daoSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check if enabled
        require(daoSettingsMinipool.getBondReductionEnabled(), "Bond reduction currently disabled");
        // Check if has been previously cancelled
        bool reductionCancelled = getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(minipool))));
        require(!reductionCancelled, "This minipool is not allowed to reduce bond");
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool must be staking");
        // Check if new bond amount is valid
        require(rocketNodeDeposit.isValidDepositAmount(_newBondAmount), "Invalid bond amount");
        uint256 existing = minipool.getNodeDepositBalance();
        require(_newBondAmount < existing, "Bond must be lower than current amount");
        // Check if enough time has elapsed since last reduction
        uint256 lastReduction = getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.time", _minipoolAddress)));
        uint256 rewardInterval = daoSettingsRewards.getRewardsClaimIntervalTime();
        require(block.timestamp >= lastReduction.add(rewardInterval), "Not enough time has passed since last bond reduction");
        // Store time and new bond amount
        setUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)), block.timestamp);
        setUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", _minipoolAddress)), _newBondAmount);
        emit BeginBondReduction(_minipoolAddress, _newBondAmount, block.timestamp);
    }

    /// @notice Returns the timestamp of when a given minipool began their bond reduction waiting period
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondTime(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)));
    }

    /// @notice Returns the new bond that a given minipool has indicated they are reducing to
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondValue(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", _minipoolAddress)));
    }

    /// @notice Returns true if the given minipool has had it's bond reduction cancelled by the oDAO
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondCancelled(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(_minipoolAddress))));
    }

    /// @notice Returns whether owner of given minipool can reduce bond amount given the waiting period constraint
    /// @param _minipoolAddress Address of the minipool
    function canReduceBondAmount(address _minipoolAddress) override public view returns (bool) {
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 reduceBondTime = getUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)));
        return rocketDAONodeTrustedSettingsMinipool.isWithinBondReductionWindow(block.timestamp.sub(reduceBondTime));
    }

    /// @notice Can be called by trusted nodes to cancel a reduction in bond if the validator has too low of a balance
    /// @param _minipoolAddress Address of the minipool
    function voteCancelReduction(address _minipoolAddress) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        // Prevent calling if consensus has already been reached
        require(!getReduceBondCancelled(_minipoolAddress), "Already cancelled");
        // Get contracts
        RocketDAONodeTrustedInterface rocketDAONode = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        // Check for multiple votes
        bytes32 memberVotedKey = keccak256(abi.encodePacked("minipool.bond.reduction.member.voted", _minipoolAddress, msg.sender));
        bool memberVoted = getBool(memberVotedKey);
        require(!memberVoted, "Member has already voted to cancel");
        setBool(memberVotedKey, true);
        // Emit event
        emit CancelReductionVoted(_minipoolAddress, msg.sender, block.timestamp);
        // Check if required quorum has voted
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 quorum = rocketDAONode.getMemberCount().mul(rocketDAONodeTrustedSettingsMinipool.getCancelBondReductionQuorum()).div(calcBase);
        bytes32 totalCancelVotesKey = keccak256(abi.encodePacked("minipool.bond.reduction.vote.count", _minipoolAddress));
        uint256 totalCancelVotes = getUint(totalCancelVotesKey).add(1);
        if (totalCancelVotes > quorum) {
            // Emit event
            emit ReductionCancelled(_minipoolAddress, block.timestamp);
            setBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", _minipoolAddress)), true);
            deleteUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)));
            deleteUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", msg.sender)));
        } else {
            // Increment total
            setUint(totalCancelVotesKey, totalCancelVotes);
        }
    }

    /// @notice Called by minipools when they are reducing bond to handle state changes outside the minipool
    function reduceBondAmount() override external onlyRegisteredMinipool(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) returns (uint256) {
        // Get contracts
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        RocketDAOProtocolSettingsMinipoolInterface daoSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check if enabled
        require(daoSettingsMinipool.getBondReductionEnabled(), "Bond reduction currently disabled");
        // Check if has been cancelled
        bool reductionCancelled = getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(msg.sender))));
        require(!reductionCancelled, "This minipool is not allowed to reduce bond");
        // Check wait period is satisfied
        require(canReduceBondAmount(msg.sender), "Wait period not satisfied");
        // Get desired to amount
        uint256 newBondAmount = getUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", msg.sender)));
        require(rocketNodeDeposit.isValidDepositAmount(newBondAmount), "Invalid bond amount");
        // Calculate difference
        uint256 existingBondAmount = minipool.getNodeDepositBalance();
        uint256 delta = existingBondAmount.sub(newBondAmount);
        // Get node address
        address nodeAddress = minipool.getNodeAddress();
        // Increase ETH matched or revert if exceeds limit based on current RPL stake
        rocketNodeDeposit.increaseEthMatched(nodeAddress, delta);
        // Increase node operator's deposit credit
        rocketNodeDeposit.increaseDepositCreditBalance(nodeAddress, delta);
        // Clean up state
        deleteUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", msg.sender)));
        deleteUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", msg.sender)));
        // Store last bond reduction time and previous bond amount
        setUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.time", msg.sender)), block.timestamp);
        setUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.prev.value", msg.sender)), existingBondAmount);
        // Return
        return newBondAmount;
    }

    /// @notice Returns a timestamp of when the given minipool last performed a bond reduction
    /// @param _minipoolAddress The address of the minipool to query
    /// @return Unix timestamp of last bond reduction (or 0 if never reduced)
    function getLastBondReductionTime(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.time", _minipoolAddress)));
    }

    /// @notice Returns the previous bond value of the given minipool on their last bond reduction
    /// @param _minipoolAddress The address of the minipool to query
    /// @return Previous bond value in wei (or 0 if never reduced)
    function getLastBondReductionPrevValue(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.prev.value", _minipoolAddress)));
    }
}
