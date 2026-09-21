// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketNetworkExitInterface} from "../../interface/network/RocketNetworkExitInterface.sol";
import {RocketNetworkParticipationInterface} from "../../interface/network/RocketNetworkParticipationInterface.sol";
import {SlotProof, BeaconStateVerifierInterface, ValidatorProof, ParticipationProof} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import {MinipoolStatus} from "../../types/MinipoolStatus.sol";
import {RocketMegapoolStorageLayout} from "../megapool/RocketMegapoolStorageLayout.sol";

/// @notice Implements the challenge and exit process for the protocol's performance requirements defined in RPIP-73
contract RocketNetworkParticipation is RocketBase, RocketNetworkParticipationInterface {
    // Events
    event MegapoolChallenged(address indexed megapoolAddress, uint32[] _validatorIds, uint256 indexed _challengeId, uint64 _startEpoch, bytes32 _root, uint256[] _participation);
    event MegapoolChallengeDefeated(uint256 _challengeId);
    event MegapoolChallengeFinalised(uint256 indexed challengeId, uint256 requestedCount, uint256 skippedCount);

    event MinipoolsChallenged(address indexed nodeAddress, uint256 indexed challengeId, address[] minipoolAddresses, uint64 startEpoch, bytes32 root, uint256[] participation);
    event MinipoolChallengeDefeated(uint256 challengeId);
    event MinipoolChallengeFinalised(uint256 indexed challengeId, uint256 requestedCount, uint256 skippedCount);

    event ChallengeBondLocked(uint256 indexed challengeId, address indexed proposer, uint256 amount, uint256 deadline);
    event ChallengeBondReleased(uint256 indexed challengeId, address indexed proposer, uint256 amount);
    event ChallengeBondSettled(uint256 indexed challengeId, address indexed proposer, address indexed responder, uint256 originalBond, uint256 recoveredAmount, uint256 reward, uint256 burn);

    // Internals
    uint64 constant internal slotsPerEpoch = 32;
    uint256 constant internal maxChallengeValidators = 32;
    uint256 constant internal slotRecencyThreshold = 1 hours;
    uint8 constant internal timelyTargetFlag = 1 << 1;

    modifier onlyLatestSelf() {
        require(address(this) == getContractAddress("rocketNetworkParticipation"), "Invalid or outdated contract");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the snapshotted bond terms and settlement state for either challenge type
    /// @param _challengeId ID of the challenge to query
    function getChallengeBondDetails(uint256 _challengeId) override public view returns (
        address proposer, address responder, uint256 bondAmount, uint256 responseDeadline, bool settled
    ) {
        _requireExistingChallenge(_challengeId);
        proposer = getAddress(keccak256(abi.encodePacked("participation.challenge.proposer", _challengeId)));
        responder = getAddress(keccak256(abi.encodePacked("participation.challenge.responder", _challengeId)));
        bondAmount = getUint(keccak256(abi.encodePacked("participation.challenge.bond", _challengeId)));
        responseDeadline = _getChallengeDeadline(_challengeId);
        settled = getBool(keccak256(abi.encodePacked("participation.challenge.bondSettled", _challengeId)));
    }

    /// @notice Returns the validator IDs in their submitted order
    /// @param _challengeId ID of the challenge to query
    function getChallengeValidatorIds(uint256 _challengeId) override public view returns (uint32[] memory) {
        _requireChallengeType(_challengeId, ChallengeType.Megapool);
        return abi.decode(getBytes(keccak256(abi.encodePacked("participation.challenge.validatorIds", _challengeId))), (uint32[]));
    }

    /// @notice Returns the minipool addresses belonging to a challenge
    /// @param _challengeId ID of the challenge to query
    function getChallengeMinipools(uint256 _challengeId) override public view returns (address[] memory) {
        _requireChallengeType(_challengeId, ChallengeType.Minipool);
        return abi.decode(getBytes(keccak256(abi.encodePacked("participation.challenge.minipools", _challengeId))), (address[]));
    }

    /// @notice Returns whether the challenge is against Minipools or a Megapool
    /// @param _challengeId ID of the challenge to query
    function getChallengeType(uint256 _challengeId) override public view returns (ChallengeType) {
        _requireExistingChallenge(_challengeId);
        return ChallengeType(getUint(keccak256(abi.encodePacked("participation.challenge.type", _challengeId))));
    }

    /// @notice Challenges 1 to 32 validator belonging to one Megapool sharing the same missed epochs
    /// @param _megapoolAddress Address of the Megapool with the challenged validators
    /// @param _validatorIds Unique internal IDs of 1 to 32 validators being challenged
    /// @param _startEpoch The first epoch of the range of epochs where participation dropped below the requirement
    /// @param _participation A bitmap of each epoch from _startEpoch encoding the epochs that the validator did not meet requirements
    /// @param _slotTimestamp Timestamp of the slot the slot proof was generated against
    /// @param _slotProof Proof of a recent slot number
    function challengeMegapool(
        address _megapoolAddress,
        uint32[] calldata _validatorIds,
        uint64 _startEpoch,
        uint256[] calldata _participation,
        uint64 _slotTimestamp,
        SlotProof calldata _slotProof
    ) external onlyLatestSelf onlyRegisteredNode(msg.sender) onlyRegisteredMegapool(_megapoolAddress) {
        // Check global enable state
        require(_getPerformanceExitsEnabled(), "Performance exits disabled");
        // Check proof recency requirement
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Validate challenge
        _validateChallengeValidators(_megapoolAddress, _validatorIds);
        (uint256 period, bytes32 root) = _validateChallengeEpochs(_startEpoch, _participation, _slotTimestamp, _slotProof);
        // Store challenge
        uint256 challengeId = _storeChallenge(ChallengeType.Megapool, _startEpoch, period, root);
        setAddress(keccak256(abi.encodePacked("participation.challenge.address", challengeId)), _megapoolAddress);
        // TODO: This is very inefficient storage, packing the IDs would save a lot of gas but require some custom encoding work
        setBytes(keccak256(abi.encodePacked("participation.challenge.validatorIds", challengeId)), abi.encode(_validatorIds));
        // Emit event
        emit MegapoolChallenged(_megapoolAddress, _validatorIds, challengeId, _startEpoch, root, _participation);
    }

    /// @notice Challenges 1 to 32 Minipools belonging to the same node operator sharing the same missed epochs
    /// @param _minipoolAddresses Array of Minipool addresses to challenge
    /// @param _startEpoch The first epoch of the range of epochs where participation dropped below the requirement
    /// @param _participation A bitmap of each epoch from _startEpoch encoding the epochs that the validator did not meet requirements
    /// @param _slotTimestamp Timestamp of the slot the slot proof was generated against
    /// @param _slotProof Proof of a recent slot number
    function challengeMinipools(
        address[] calldata _minipoolAddresses,
        uint64 _startEpoch,
        uint256[] calldata _participation,
        uint64 _slotTimestamp,
        SlotProof calldata _slotProof
    ) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        // Check global enable state
        require(_getPerformanceExitsEnabled(), "Performance exits disabled");
        // Check proof recency requirement
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Validate challenge
        address nodeAddress = _validateChallengeMinipools(_minipoolAddresses);
        (uint256 period, bytes32 root) = _validateChallengeEpochs(_startEpoch, _participation, _slotTimestamp, _slotProof);
        // Store challenge
        uint256 challengeId = _storeChallenge(ChallengeType.Minipool, _startEpoch, period, root);
        setAddress(keccak256(abi.encodePacked("participation.challenge.node", challengeId)), nodeAddress);
        setBytes(keccak256(abi.encodePacked("participation.challenge.minipools", challengeId)), abi.encode(_minipoolAddresses));
        // Emit event
        emit MinipoolsChallenged(nodeAddress, challengeId, _minipoolAddresses, _startEpoch, root, _participation);
    }

    /// @notice Allows a registered node other than the proposer to defeat the entire challenge by proving a listed validator activated after its start epoch
    /// @param _challengeId ID of the challenge
    /// @param _validatorId Internal ID of the listed validator the proof concerns
    /// @param _slotTimestamp Slot which the beacon state proof was generated against
    /// @param _validatorProof Proof about the state of the validator on the beacon chain
    /// @param _slotProof Proof of the slot number the participation proof was generated against
    function respondWithMegapoolValidator(
        uint256 _challengeId,
        uint32 _validatorId,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        SlotProof calldata _slotProof
    ) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        _requireAliveChallenge(_challengeId);
        bytes32 pubkeyHash = keccak256(_getChallengeValidatorPubkey(_challengeId, _validatorId));
        _respondWithValidator(_challengeId, pubkeyHash, _slotTimestamp, _validatorProof, _slotProof);
    }

    /// @notice Defeats a minipool list using proof for one listed member
    /// @param _challengeId ID of the challenge
    /// @param _minipoolAddress Address of the Minipool the challenge was made against
    /// @param _slotTimestamp Slot which the beacon state proof was generated against
    /// @param _validatorProof Proof about the state of the validator on the beacon chain
    /// @param _slotProof Proof of the slot number the participation proof was generated against
    function respondWithMinipoolValidator(
        uint256 _challengeId,
        address _minipoolAddress,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        SlotProof calldata _slotProof
    ) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        _requireAliveChallenge(_challengeId);
        bytes32 pubkeyHash = keccak256(_getChallengeMinipoolPubkey(_challengeId, _minipoolAddress));
        _respondWithValidator(_challengeId, pubkeyHash, _slotTimestamp, _validatorProof, _slotProof);
    }

    /// @notice Allows a registered node other than the proposer to defeat the entire challenge with a timely target vote by one listed validator
    /// @param _challengeId ID of the challenge
    /// @param _validatorId Internal ID of the listed validator the proof concerns
    /// @param _offset Offset from the start epoch to the epoch with fraud
    /// @param _challengeLeaf The leaf node containing the offset from the challenge merkle tree
    /// @param _challengeWitness Proof that the challenge leaf is contained in the challenge merkle tree
    /// @param _slotTimestamp Slot which the beacon state proof was generated against
    /// @param _validatorProof Beacon state proof of the validator
    /// @param _participationProof Beacon state proof of the fraud
    /// @param _slotProof Proof of the slot number the participation proof was generated against
    function respondWithMegapoolParticipation(
        uint256 _challengeId,
        uint32 _validatorId,
        uint64 _offset,
        uint256 _challengeLeaf,
        bytes32[] calldata _challengeWitness,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        _requireAliveChallenge(_challengeId);
        bytes32 pubkeyHash = keccak256(_getChallengeValidatorPubkey(_challengeId, _validatorId));
        _respondWithParticipation(_challengeId, pubkeyHash, _offset, _challengeLeaf, _challengeWitness, _slotTimestamp, _validatorProof, _participationProof, _slotProof);
    }

    /// @notice Allows a registered node other than the proposer to defeat the entire challenge with a timely target vote by one listed validator
    /// @param _challengeId ID of the challenge
    /// @param _minipoolAddress Address of the Minipool the challenge was made against
    /// @param _offset Offset from the start epoch to the epoch with fraud
    /// @param _challengeLeaf The leaf node containing the offset from the challenge merkle tree
    /// @param _challengeWitness Proof that the challenge leaf is contained in the challenge merkle tree
    /// @param _slotTimestamp Slot which the beacon state proof was generated against
    /// @param _validatorProof Beacon state proof of the validator
    /// @param _participationProof Beacon state proof of the fraud
    /// @param _slotProof Proof of the slot number the participation proof was generated against
    function respondWithMinipoolParticipation(
        uint256 _challengeId,
        address _minipoolAddress,
        uint64 _offset,
        uint256 _challengeLeaf,
        bytes32[] calldata _challengeWitness,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        _requireAliveChallenge(_challengeId);
        bytes32 pubkeyHash = keccak256(_getChallengeMinipoolPubkey(_challengeId, _minipoolAddress));
        _respondWithParticipation(_challengeId, pubkeyHash, _offset, _challengeLeaf, _challengeWitness, _slotTimestamp, _validatorProof, _participationProof, _slotProof);
    }

    /// @notice Unlocks an undefeated challenge's bond after its response deadline, independently of exit finalisation
    /// @param _challengeId ID of the challenge to release the bond for
    function releaseChallengeBond(uint256 _challengeId) override external onlyLatestSelf {
        // Query bond details
        (address proposer,, uint256 bond, uint256 deadline, bool settled) = getChallengeBondDetails(_challengeId);
        // Validate state
        require(!getBool(keccak256(abi.encodePacked("participation.challenge.responded", _challengeId))), "Challenge was defeated");
        require(!settled, "Bond already settled");
        require(block.timestamp > deadline, "Challenge period has not passed");
        // Store bond settled flag
        setBool(keccak256(abi.encodePacked("participation.challenge.bondSettled", _challengeId)), true);
        // Unlock bond
        _getNodeStaking().unlockRPL(proposer, bond);
        // Emit event
        emit ChallengeBondReleased(_challengeId, proposer, bond);
    }

    /// @notice Claims a defeated challenge's recoverable bond as staked RPL
    /// @param _challengeId ID of the challenge to claim the reward for
    function claimChallengeReward(uint256 _challengeId) override external onlyLatestSelf onlyRegisteredNode(msg.sender) {
        // Query challenge bond details
        (address proposer, address responder, uint256 bond,, bool settled) = getChallengeBondDetails(_challengeId);
        // Validate state
        require(getBool(keccak256(abi.encodePacked("participation.challenge.responded", _challengeId))), "Challenge was not defeated");
        require(msg.sender == responder, "Invalid responder");
        require(!settled, "Bond already settled");
        RocketNodeStakingInterface staking = _getNodeStaking();
        // Best effort reward from bond
        uint256 recovered = staking.getNodeStakedRPL(proposer);
        if (recovered > bond) recovered = bond;
        // Compute the 20% bond burn amount and remaining reward
        uint256 burn = recovered / 5;
        uint256 reward = recovered - burn;
        // Settle and clear the complete recorded lock, including any amount consumed by slashing
        setBool(keccak256(abi.encodePacked("participation.challenge.bondSettled", _challengeId)), true);
        staking.unlockRPL(proposer, bond);
        if (burn != 0) staking.burnRPL(proposer, burn);
        if (reward != 0) staking.transferRPL(proposer, responder, reward);
        // Emit event
        emit ChallengeBondSettled(_challengeId, proposer, responder, bond, recovered, reward, burn);
    }

    /// @notice Requests exits for an undefeated list, skipping validators already handled
    /// @param _challengeId ID of the successful challenge
    function finaliseChallenge(uint256 _challengeId) override external onlyLatestSelf {
        // Validate input
        _requireUnresolvedChallenge(_challengeId);
        // Check correct time has passed
        require(_getChallengeDeadline(_challengeId) < block.timestamp, "Not enough time has passed");
        // Write finalised flag
        setBool(keccak256(abi.encodePacked("participation.challenge.finalised", _challengeId)), true);
        // Execute type-specific finalise function
        if (getChallengeType(_challengeId) == ChallengeType.Minipool) {
            _finaliseMinipoolChallenge(_challengeId);
        } else {
            _finaliseMegapoolChallenge(_challengeId);
        }
    }

    // Internals

    /// @dev Returns the deadline of a challenge
    function _getChallengeDeadline(uint256 _challengeId) internal view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("participation.challenge.deadline", _challengeId)));
    }

    /// @dev Convenience function to get rocketNodeStaking contract interface
    function _getNodeStaking() internal view returns (RocketNodeStakingInterface) {
        return RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
    }

    function _respondWithValidator(
        uint256 _challengeId,
        bytes32 _pubkeyHash,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        SlotProof calldata _slotProof
    ) internal {
        // Check proof recency requirement
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Get challenge details
        uint256 startEpoch = getUint(keccak256(abi.encodePacked("participation.challenge.start", _challengeId)));
        // Only activation after the start epoch invalidates the challenge on this response path
        require(
            _validatorProof.validator.activationEpoch > startEpoch,
            "Validator was staking during challenge period"
        );
        // Verify proof was for the challenged validator
        require(keccak256(_validatorProof.validator.pubkey) == _pubkeyHash, "Incorrect validator");
        // Verify validator state via beacon state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Defeat the challenge
        _defeatChallenge(_challengeId);
    }

    function _respondWithParticipation(
        uint256 _challengeId,
        bytes32 _pubkeyHash,
        uint64 _offset,
        uint256 _challengeLeaf,
        bytes32[] calldata _challengeWitness,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) internal {
        // Get challenge data
        bytes32 root = getBytes32(keccak256(abi.encodePacked("participation.challenge.root", _challengeId)));
        uint256 startEpoch = getUint(keccak256(abi.encodePacked("participation.challenge.start", _challengeId)));
        uint256 period = getUint(keccak256(abi.encodePacked("participation.challenge.period", _challengeId)));
        // Response must be for an epoch within the challenge window
        require(_offset < period, "Epoch too high");
        // Participation flags must show that participation did actually occur at the challenged epoch
        require(_validateParticipationFlags(_getParticipationFlags(_participationProof)), "Invalid participation");
        // Response must be to an epoch that was actually marked as missed
        {
            uint256 participationBit = _offset % 256;
            uint256 participationMask = uint256(1) << participationBit;
            require((_challengeLeaf & participationMask) != 0, "Epoch not challenged");
        }
        // Prove the epoch referred to by this offset was actually challenged
        {
            uint256 leafIndex = _offset / 256;
            uint256 leafCount = (period + 255) / 256;
            uint256 merklePath = _nextPowerOfTwo(leafCount) + leafIndex;
            bytes32 restoredRoot = _restoreMerkleRoot(bytes32(_challengeLeaf), merklePath, _challengeWitness);
            require(restoredRoot == root, "Invalid challenge proof");
        }
        // Calculate the expected slot for the proof (must be the 1st slot of the epoch following the challenged epoch)
        uint256 challengedEpoch = startEpoch + _offset;
        uint256 proofEpoch = _participationProof.participationSlot / slotsPerEpoch;
        require(proofEpoch == challengedEpoch + 1, "Invalid slot");
        // Verify via beacon state proof that participation did actually occur
        _verifyParticipationResponseProofs(_pubkeyHash, _slotTimestamp, _validatorProof, _participationProof, _slotProof);
        // Defeat the challenge
        _defeatChallenge(_challengeId);
    }

    function _finaliseMegapoolChallenge(uint256 _challengeId) internal {
        // Get contracts
        address megapoolAddress = getAddress(keccak256(abi.encodePacked("participation.challenge.address", _challengeId)));
        RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(megapoolAddress);
        RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
        // Decode validator IDs from storage
        uint32[] memory validatorIds = getChallengeValidatorIds(_challengeId);
        // Iterate and attempt to begin cooperative exit
        uint256 requestedCount;
        for (uint256 i = 0; i < validatorIds.length; ++i) {
            uint32 validatorId = validatorIds[i];
            RocketMegapoolStorageLayout.ValidatorInfo memory validator = megapool.getValidatorInfo(validatorId);
            // Check if validator exited via other means during challenge window
            if (validator.exiting || validator.exited ||
            networkExit.getMegapoolExitType(megapoolAddress, validatorId) != RocketNetworkExitInterface.ExitType.None ||
                networkExit.getMegapoolCooperativeExitStart(megapoolAddress, validatorId) != 0) {
                continue;
            }
            // Request the exit
            networkExit.requestMegapoolExit(megapoolAddress, validatorId);
            ++requestedCount;
        }
        // Emit event
        emit MegapoolChallengeFinalised(_challengeId, requestedCount, validatorIds.length - requestedCount);
    }

    function _finaliseMinipoolChallenge(uint256 _challengeId) internal {
        address[] memory minipools = getChallengeMinipools(_challengeId);
        RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
        uint256 requestedCount;
        for (uint256 i = 0; i < minipools.length; ++i) {
            RocketMinipoolInterface minipool = RocketMinipoolInterface(minipools[i]);
            if (networkExit.getMinipoolCooperativeExitStart(minipools[i]) != 0 ||
            minipool.getFinalised() || minipool.getUserDistributed()) {
                continue;
            }
            // RocketNetworkExit retains responsibility for status validation, retry backoff and accounting
            networkExit.requestMinipoolExit(minipools[i]);
            ++requestedCount;
        }
        // Emit event
        emit MinipoolChallengeFinalised(_challengeId, requestedCount, minipools.length - requestedCount);
    }

    /// @dev Verifies all the relevant proofs for a participation response
    function _verifyParticipationResponseProofs(
        bytes32 _pubkeyHash,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) internal view {
        require(_validatorProof.validatorIndex == _participationProof.validatorIndex, "Incorrect validator index");
        require(keccak256(_validatorProof.validator.pubkey) == _pubkeyHash, "Incorrect validator");
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifyParticipation(_slotTimestamp, _slotProof.slot, _participationProof), "Invalid participation proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
    }

    /// @dev Writes challenge data to storage and returns challenge ID
    function _storeChallenge(ChallengeType _type, uint64 _startEpoch, uint256 _period, bytes32 _root) internal returns (uint256 challengeId) {
        challengeId = getUint(keccak256("participation.challenge.count")) + 1;
        setUint(keccak256("participation.challenge.count"), challengeId);
        setUint(keccak256(abi.encodePacked("participation.challenge.type", challengeId)), uint256(_type));
        setBytes32(keccak256(abi.encodePacked("participation.challenge.root", challengeId)), _root);
        setUint(keccak256(abi.encodePacked("participation.challenge.time", challengeId)), block.timestamp);
        setUint(keccak256(abi.encodePacked("participation.challenge.start", challengeId)), _startEpoch);
        setUint(keccak256(abi.encodePacked("participation.challenge.period", challengeId)), _period);
        uint256 bond = _getNetworkSettings().getPerformanceChallengeBond();
        uint256 deadline = block.timestamp + _getParticipationChallengeTime();
        setAddress(keccak256(abi.encodePacked("participation.challenge.proposer", challengeId)), msg.sender);
        setUint(keccak256(abi.encodePacked("participation.challenge.bond", challengeId)), bond);
        setUint(keccak256(abi.encodePacked("participation.challenge.deadline", challengeId)), deadline);
        _getNodeStaking().lockRPL(msg.sender, bond);
        // Emit event
        emit ChallengeBondLocked(challengeId, msg.sender, bond, deadline);
    }

    function _validateChallengeMinipools(address[] calldata _minipools) internal view returns (address nodeAddress) {
        require(_minipools.length > 0, "No validators supplied");
        require(_minipools.length <= maxChallengeValidators, "Too many validators");
        RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
        for (uint256 i = 0; i < _minipools.length; ++i) {
            for (uint256 j = 0; j < i; ++j) {
                require(_minipools[j] != _minipools[i], "Duplicate validator");
            }
            require(getBool(keccak256(abi.encodePacked("minipool.exists", _minipools[i]))), "Invalid minipool");
            RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipools[i]);
            if (i == 0) nodeAddress = minipool.getNodeAddress();
            else require(minipool.getNodeAddress() == nodeAddress, "Different node operators");
            require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool is not staking");
            require(!minipool.getFinalised(), "Minipool is finalised");
            require(!minipool.getUserDistributed(), "User capital already distributed");
            require(networkExit.getMinipoolCooperativeExitStart(_minipools[i]) == 0, "Minipool already requested to exit");
        }
    }

    function _getChallengeMinipoolPubkey(uint256 _challengeId, address _minipoolAddress) internal view returns (bytes memory) {
        address[] memory minipools = getChallengeMinipools(_challengeId);
        for (uint256 i = 0; i < minipools.length; ++i) {
            if (minipools[i] == _minipoolAddress) {
                return RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager")).getMinipoolPubkey(_minipoolAddress);
            }
        }
        revert("Validator not in challenge");
    }

    /// @dev Validate and hash the participation tree
    function _validateChallengeEpochs(
        uint64 _startEpoch,
        uint256[] calldata _participation,
        uint64 _slotTimestamp,
        SlotProof calldata _slotProof
    ) internal view returns (uint256 period, bytes32 root) {
        // Verify the slot proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Validate start epoch
        uint256 currentEpoch = _slotProof.slot / slotsPerEpoch;
        require(_startEpoch < currentEpoch, "Challenge starts in future");
        period = _getPerformancePeriod();
        require(_startEpoch + period + _getProofBuffer() > currentEpoch, "Challenge too recent");
        uint256 elapsedEpochs = currentEpoch - _startEpoch;
        uint256 challengeableEpochs = elapsedEpochs < period ? elapsedEpochs : period;
        // Validate length and padding of bitmap
        require(_validateParticipationBitmap(period, challengeableEpochs, _participation), "Invalid participation bitmap");
        // Compute the hamming weight and confirm against performance requirement
        require(_calculateHammingWeight(_participation) >= _getMinimumPerformanceRequirement(period), "Participation is above requirement");
        // Compute and return the merkle tree root
        root = _hashTree(_participation);
    }

    /// @dev Validate every list member before storing the shared challenge
    function _validateChallengeValidators(address _megapoolAddress, uint32[] calldata _validatorIds) internal view {
        require(_validatorIds.length > 0, "No validators supplied");
        require(_validatorIds.length <= maxChallengeValidators, "Too many validators");
        RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(_megapoolAddress);
        RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
        for (uint256 i = 0; i < _validatorIds.length; ++i) {
            uint32 validatorId = _validatorIds[i];
            for (uint256 j = 0; j < i; ++j) {
                require(_validatorIds[j] != validatorId, "Duplicate validator");
            }
            RocketMegapoolStorageLayout.ValidatorInfo memory validator = megapool.getValidatorInfo(validatorId);
            require(validator.staked, "Validator not staked");
            require(!validator.dissolved, "Validator is dissolved");
            require(!validator.exiting, "Already exiting");
            require(!validator.exited, "Already exited");
            require(networkExit.getMegapoolCooperativeExitStart(_megapoolAddress, validatorId) == 0, "Exit has already been requested");
            require(networkExit.getMegapoolExitType(_megapoolAddress, validatorId) == RocketNetworkExitInterface.ExitType.None, "Validator exit already tracked");
        }
    }

    /// @dev Resolve a pubkey only when the supplied internal ID belongs to this challenge
    function _getChallengeValidatorPubkey(uint256 _challengeId, uint32 _validatorId) internal view returns (bytes memory) {
        uint32[] memory validatorIds = getChallengeValidatorIds(_challengeId);
        for (uint256 i = 0; i < validatorIds.length; ++i) {
            if (validatorIds[i] == _validatorId) {
                address megapoolAddress = getAddress(keccak256(abi.encodePacked("participation.challenge.address", _challengeId)));
                return RocketMegapoolDelegateInterface(megapoolAddress).getValidatorPubkey(_validatorId);
            }
        }
        revert("Validator not in challenge");
    }

    function _restoreMerkleRoot(bytes32 _leaf, uint256 _gindex, bytes32[] calldata _witnesses) internal view returns (bytes32) {
        // Removing exactly one path level per witness must leave only the root bit
        require(_gindex >> _witnesses.length == 1, "Invalid witness length");
        bytes32 value = _leaf;
        uint256 i = 0;
        while (_gindex != 1) {
            if (_gindex % 2 == 1) {
                value = _efficientSha256(_witnesses[i], value);
            } else {
                value = _efficientSha256(value, _witnesses[i]);
            }
            _gindex /= 2;
            unchecked {
                i++;
            }
        }
        return value;
    }

    /// @dev Validate length and padding of a given participation bitmap
    /// @param _period The challenge period in epochs
    /// @param _challengeableEpochs The number of epochs which are actually challengable (lower than current epoch)
    /// @param _participationBitmap The participation bitmap
    function _validateParticipationBitmap(
        uint256 _period,
        uint256 _challengeableEpochs,
        uint256[] calldata _participationBitmap
    ) internal pure returns (bool) {
        uint256 expectedLength = (_period + 255) / 256;
        if (_participationBitmap.length != expectedLength) return false;
        if (_challengeableEpochs > _period) return false;

        uint256 fullWords = _challengeableEpochs / 256;
        uint256 remainder = _challengeableEpochs % 256;

        if (remainder != 0) {
            uint256 validBitsMask = (uint256(1) << remainder) - 1;
            if ((_participationBitmap[fullWords] & ~validBitsMask) != 0) return false;
            fullWords++;
        }

        for (uint256 i = fullWords; i < _participationBitmap.length; ++i) {
            if (_participationBitmap[i] != 0) return false;
        }

        return true;
    }

    /// @dev Returns true if performance exits are globally enabled
    function _getPerformanceExitsEnabled() internal view returns (bool) {
        return _getNetworkSettings().getPerformanceExitsEnabled();
    }

    function _getParticipationChallengeTime() internal view returns (uint256) {
        return _getNetworkSettings().getPerformanceChallengePeriod();
    }

    /// @dev Gets the performance measurement period in epochs
    function _getPerformancePeriod() internal view returns (uint256) {
        return _getNetworkSettings().getPerformancePeriod();
    }

    /// @dev Returns the number of epochs that must be missed for a challenge to be valid
    function _getMinimumPerformanceRequirement(uint256 _period) internal view returns (uint256) {
        uint256 threshold = _getNetworkSettings().getPerformanceThreshold();
        uint256 missed = _period * (calcBase - threshold);
        return (missed + calcBase - 1) / calcBase;
    }

    /// @dev Returns the buffer time (in epochs) for proofs to limit the age of performance challenges
    function _getProofBuffer() internal view returns (uint256) {
        return _getNetworkSettings().getPerformanceProofBuffer();
    }

    function _getNetworkSettings() internal view returns (RocketDAOProtocolSettingsNetworkInterface) {
        return RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
    }

    /// @dev Constructs a merkle tree from the given leaves and returns the root hash
    function _hashTree(uint256[] calldata _leaves) internal view returns (bytes32) {
        uint256 leafCount = _leaves.length;
        require(leafCount != 0, "Invalid tree");

        uint256 width = _nextPowerOfTwo(leafCount);
        bytes32[] memory tree = new bytes32[](width);

        for (uint256 i = 0; i < leafCount; ++i) {
            tree[i] = bytes32(_leaves[i]);
        }

        while (width > 1) {
            for (uint256 i = 0; i < width; i += 2) {
                tree[i / 2] = _efficientSha256(tree[i], tree[i + 1]);
            }
            width /= 2;
        }

        return tree[0];
    }

    /// @dev Returns the closest power of two value equal or greater than the given value
    function _nextPowerOfTwo(uint256 _value) internal pure returns (uint256) {
        require(_value != 0, "Invalid length");
        uint256 result = 1;
        while (result < _value) {
            require(result <= type(uint256).max / 2, "Length too large");
            result *= 2;
        }
        return result;
    }

    /// @dev Returns true if the given participation flags meet the requirement
    function _validateParticipationFlags(uint8 _participationFlags) internal pure returns (bool) {
        return _participationFlags & timelyTargetFlag != 0;
    }

    /// @dev Extracts the target validator's participation flags from a proof
    function _getParticipationFlags(ParticipationProof calldata _proof) internal pure returns (uint8) {
        return uint8(_proof.participationFlagsChunk[_proof.validatorIndex % 32]);
    }

    /// @dev Marks the given challenge as defeated
    function _defeatChallenge(uint256 _challengeId) internal {
        // Cancel the challenge
        setBool(keccak256(abi.encodePacked("participation.challenge.responded", _challengeId)), true);
        setAddress(keccak256(abi.encodePacked("participation.challenge.responder", _challengeId)), msg.sender);
        // Emit event
        if (getChallengeType(_challengeId) == ChallengeType.Minipool) emit MinipoolChallengeDefeated(_challengeId);
        else emit MegapoolChallengeDefeated(_challengeId);
    }

    /// @dev Reject challenges that do not match a specific type
    function _requireChallengeType(uint256 _challengeId, ChallengeType _type) internal view {
        require(getChallengeType(_challengeId) == _type, "Incorrect challenge type");
    }

    /// @dev Reject challenges that have reached either terminal state
    function _requireUnresolvedChallenge(uint256 _challengeId) internal view {
        _requireExistingChallenge(_challengeId);
        require(!getBool(keccak256(abi.encodePacked("participation.challenge.responded", _challengeId))), "Challenge was defeated");
        require(!getBool(keccak256(abi.encodePacked("participation.challenge.finalised", _challengeId))), "Challenge already finalised");
    }

    /// @dev Reverts if a challenge does not exists or has already expired
    function _requireAliveChallenge(uint256 _challengeId) internal view {
        _requireUnresolvedChallenge(_challengeId);
        require(_getChallengeDeadline(_challengeId) >= block.timestamp, "Challenge period has passed");
        require(msg.sender != getAddress(keccak256(abi.encodePacked("participation.challenge.proposer", _challengeId))), "Cannot defeat own challenge");
    }

    /// @dev Reverts if a challenge does not exists
    function _requireExistingChallenge(uint256 _challengeId) internal view {
        uint256 challengeTime = getUint(keccak256(abi.encodePacked("participation.challenge.time", _challengeId)));
        require(challengeTime != 0, "Invalid challenge");
    }

    /// @dev Computes the hamming weight of the given participation bitmap
    /// @param _participationBitmap The participation bitmap
    function _calculateHammingWeight(uint256[] calldata _participationBitmap) internal pure returns (uint256) {
        // TODO: We could return as soon as the requirement is met instead of calculating and returning the full result
        // Kernighan algorithm is optimised for sparse bitmap hamming weight calculation
        uint256 count = 0;
        unchecked {
            for (uint256 i = 0; i < _participationBitmap.length; ++i) {
                uint256 x = _participationBitmap[i];

                while (x != 0) {
                    x &= x - 1; // clear lowest set bit
                    ++count;
                }
            }
        }
        return count;
    }

    /// @dev Concatenates two bytes32 values and returns a SHA256 of the result
    function _efficientSha256(bytes32 _left, bytes32 _right) internal view returns (bytes32 ret) {
        assembly {
            mstore(0x00, _left)
            mstore(0x20, _right)

            let result := staticcall(gas(), 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            ret := mload(0x00)
        }
    }
}
