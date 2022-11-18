// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "./RocketMinipoolDelegate.sol";
import "../../interface/minipool/RocketMinipoolBondReducerInterface.sol";

/// @notice Handles bond reduction window and trusted node cancellation
contract RocketMinipoolBondReducer is RocketBase, RocketMinipoolBondReducerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BeginBondReduction(address indexed minipool, uint256 time);
    event CancelReductionVoted(address indexed minipool, address indexed member, uint256 time);
    event ReductionCancelled(address indexed minipool, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Flags a minipool as wanting to reduce collateral, owner can then call `reduceBondAmount` once waiting
    ///         period has elapsed
    /// @param _minipoolAddress Address of the minipool
    function beginReduceBondAmount(address _minipoolAddress) override external onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        RocketMinipoolDelegate minipool = RocketMinipoolDelegate(_minipoolAddress);
        require(msg.sender == minipool.getNodeAddress(), "Only minipool owner");
        // Check if has been previously cancelled
        bool reductionCancelled = getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(minipool))));
        require(!reductionCancelled, "This minipool is not allowed to reduce bond");
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool must be staking");
        setUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)), block.timestamp);
        emit BeginBondReduction(_minipoolAddress, block.timestamp);
    }

    /// @notice Returns whether owner of given minipool can reduce bond amount given the waiting period constraint
    /// @param _minipoolAddress Address of the minipool
    function canReduceBondAmount(address _minipoolAddress) override public view returns (bool) {
        RocketMinipoolDelegate minipool = RocketMinipoolDelegate(_minipoolAddress);
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 reduceBondTime = getUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)));
        return rocketDAONodeTrustedSettingsMinipool.isWithinBondReductionWindow(block.timestamp.sub(reduceBondTime));
    }

    /// @notice Can be called by trusted nodes to cancel a reduction in bond if the validator has too low of a balance
    /// @param _minipoolAddress Address of the minipool
    function voteCancelReduction(address _minipoolAddress) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        RocketMinipoolDelegate minipool = RocketMinipoolDelegate(_minipoolAddress);
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
        } else {
            // Increment total
            setUint(totalCancelVotesKey, totalCancelVotes);
        }
    }

    /// @notice Called by minipools when they are reducing bond to handle state changes outside the minipool
    /// @param _from The previous bond amount
    /// @param _to The new bond amount
    function reduceBondAmount(uint256 _from, uint256 _to) override external onlyRegisteredMinipool(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        // Check if has been cancelled
        bool reductionCancelled = getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(msg.sender))));
        require(!reductionCancelled, "This minipool is not allowed to reduce bond");
        // Check wait period is satisfied
        require(canReduceBondAmount(msg.sender), "Wait period not satisfied");
        // Get contracts
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        RocketMinipoolDelegate minipool = RocketMinipoolDelegate(msg.sender);
        // Check the new bond amount is valid
        require(rocketNodeDeposit.isValidDepositAmount(_to), "Invalid bond amount");
        // Calculate difference
        uint256 delta = _from.sub(_to);
        // Get node address
        address nodeAddress = minipool.getNodeAddress();
        // Increase ETH matched or revert if exceeds limit based on current RPL stake
        rocketNodeDeposit.increaseEthMatched(nodeAddress, delta);
        // Increase node operator's deposit credit
        rocketNodeDeposit.increaseDepositCreditBalance(nodeAddress, delta);
    }
}
