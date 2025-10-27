// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {SSZ} from "./SSZ.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Validator, WithdrawalProof, SlotProof, Withdrawal} from "../../interface/util/BeaconStateVerifierInterface.sol";

contract BeaconStateVerifier is RocketBase, BeaconStateVerifierInterface {
    // Immutables
    uint256 internal immutable slotsPerHistoricalRoot;
    uint256 internal immutable historicalSummaryOffset;
    uint64 internal immutable slotPhase0;
    uint64 internal immutable slotAltair;
    uint64 internal immutable slotBellatrix;
    uint64 internal immutable slotCapella;
    uint64 internal immutable slotDeneb;
    uint64 internal immutable slotElectra;

    address internal immutable beaconRoots;                         // 0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02

    bytes32 internal immutable genesisWitness;

    // Enums
    enum Fork {
        PHASE_0,
        ALTAIR,
        BELLATRIX,
        CAPELLA,
        DENEB,
        ELECTRA
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, uint256 _slotsPerHistoricalRoot, uint64[5] memory _forkSlots, address _beaconRoots, uint256 _genesisTime, bytes32 _genesisValidatorRoot) RocketBase(_rocketStorageAddress) {
        version = 1;
        slotsPerHistoricalRoot = _slotsPerHistoricalRoot;
        beaconRoots = _beaconRoots;
        // Set fork slots
        slotPhase0 = 0;
        slotAltair = _forkSlots[0];
        slotBellatrix = _forkSlots[1];
        slotCapella = _forkSlots[2];
        slotDeneb = _forkSlots[3];
        slotElectra = _forkSlots[4];
        // Historical summaries started being appended from Capella onwards, depending on the chain we might need an offset
        historicalSummaryOffset = slotCapella / slotsPerHistoricalRoot;
        // Compute the genesis_time/genesis_validator_root witness to protect slot proofs from changes to beacon state container
        genesisWitness = SSZ.efficientSha256(SSZ.toLittleEndian(_genesisTime), _genesisValidatorRoot);
    }

    /// @notice Verifies a proof about a validator on the beacon chain
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _slot Slot number that the proof was generated for
    /// @param _proof Proof of the validator
    function verifyValidator(uint64 _slotTimestamp, uint64 _slot, ValidatorProof calldata _proof) override external view returns(bool) {
        // Only support post-electra state proofs
        require(_slot >= slotElectra, "Invalid proof");
        // Construct gindex
        SSZ.Path memory path = _pathBeaconBlockHeaderToStateRoot();
        path = SSZ.concat(path, _pathBeaconStateToValidator(_proof.validatorIndex));
        // Restore the block root for the supplied slot
        require(SSZ.length(path) == _proof.witnesses.length, "Invalid witness length");
        bytes32 computedRoot = SSZ.restoreMerkleRoot(_merkleiseValidator(_proof.validator), SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = _getParentBlockRoot(_slotTimestamp);
        return computedRoot == root;
    }

    /// @notice Verifies a proof about the existence of a withdrawal on the beacon chain
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _slot Slot number that the proof was generated for
    /// @param _proof Proof of the withdrawal
    function verifyWithdrawal(uint64 _slotTimestamp, uint64 _slot, WithdrawalProof calldata _proof) override external view returns(bool) {
        // Only support post-electra state proofs
        require(_slot >= slotElectra, "Invalid proof");
        require(_proof.withdrawalSlot >= slotElectra, "Invalid proof");
        // Construct gindex
        SSZ.Path memory path = _pathBeaconBlockHeaderToStateRoot();
        path = SSZ.concat(path, _pathBeaconStateToPastBlockRoot(_slot, _proof.withdrawalSlot));
        path = SSZ.concat(path, _pathBlockToWithdrawal(_proof.withdrawalNum));
        // Merkleise the withdrawal struct
        bytes32 leaf = _merkleiseWithdrawal(_proof.withdrawal);
        // Restore the block root for the supplied slot
        require(SSZ.length(path) == _proof.witnesses.length, "Invalid witness length");
        bytes32 computedRoot = SSZ.restoreMerkleRoot(leaf, SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = _getParentBlockRoot(_slotTimestamp);
        return computedRoot == root;
    }

    /// @notice Verifies a proof about the slot
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash of the slot used for proofs
    /// @param _proof Proof of the slot value
    function verifySlot(uint64 _slotTimestamp, SlotProof calldata _proof) override external view returns(bool) {
        // Only support post-electra state proofs
        require(_proof.slot >= slotElectra, "Invalid proof");
        /**
          * genesisWitness represents the merkleised root of genesis_time ++ genesis_validators_root
          * By checking it against a known-value for the chain we are on, we are protecting from a future hard fork
          * which modifies the gindex of `slot` which would allow someone to prove an invalid `slot` value.
          *
          *         genesisWitness (witness[1])                          ...
          *           /                    \                        /            \
          *     genesis_time       genesis_validators_root        slot      fork (witness[0])          ...
          */
        require(_proof.witnesses[1] == genesisWitness, "Invalid genesis witness");
        // Retrieve the parent block hash
        bytes32 root = _getParentBlockRoot(_slotTimestamp);
        // Construct gindex
        SSZ.Path memory path = _pathBeaconBlockHeaderToStateRoot();
        path = SSZ.concat(path, _pathBeaconStateToSlot());
        // Merkleise the slot number
        bytes32 leaf = SSZ.toLittleEndian(uint256(_proof.slot));
        // Restore the block root for the supplied slot
        require(SSZ.length(path) == _proof.witnesses.length, "Invalid witness length");
        bytes32 computedRoot = SSZ.restoreMerkleRoot(leaf, SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        return computedRoot == root;
    }

    /// @dev Gets the parent block root for a given slot
    /// @param _slotTimestamp Timestamp of the slot containing the parent block hash
    function _getParentBlockRoot(uint64 _slotTimestamp) internal view returns (bytes32) {
        (bool success, bytes memory result) = beaconRoots.staticcall(abi.encode(_slotTimestamp));
        if (success && result.length > 0) {
            return abi.decode(result, (bytes32));
        }
        // Fail
        revert("Block root is not available");
    }

    /// @dev Returns whether the target slot is older than SLOTS_PER_HISTORICAL_ROOT indicating a proof must be for an older slot
    function _isHistoricalProof(uint64 _proofSlot, uint64 _targetSlot) internal view returns (bool) {
        require(_proofSlot > _targetSlot, "Invalid slot for proof");
        return _targetSlot + slotsPerHistoricalRoot < _proofSlot;
    }

    /// @dev Returns the SSZ merkle root of a given withdrawal container
    function _merkleiseWithdrawal(Withdrawal calldata _withdrawal) internal view returns (bytes32) {
        bytes32 left = SSZ.efficientSha256(SSZ.toLittleEndian(_withdrawal.index), SSZ.toLittleEndian(_withdrawal.validatorIndex));
        bytes32 right = SSZ.efficientSha256(_withdrawal.withdrawalCredentials, SSZ.toLittleEndian(_withdrawal.amountInGwei));
        return SSZ.efficientSha256(left, right);
    }

    /// @dev Returns the SSZ merkle root of a given validator
    function _merkleiseValidator(Validator calldata _validator) internal view returns (bytes32) {
        bytes32 a = SSZ.efficientSha256(SSZ.merkleisePubkey(_validator.pubkey), _validator.withdrawalCredentials);
        bytes32 b = SSZ.efficientSha256(SSZ.toLittleEndian(_validator.effectiveBalance), SSZ.toLittleEndian(_validator.slashed ? 1 : 0));
        bytes32 c = SSZ.efficientSha256(SSZ.toLittleEndian(uint256(_validator.activationEligibilityEpoch)), SSZ.toLittleEndian(uint256(_validator.activationEpoch)));
        bytes32 d = SSZ.efficientSha256(SSZ.toLittleEndian(uint256(_validator.exitEpoch)), SSZ.toLittleEndian(uint256(_validator.withdrawableEpoch)));
        a = SSZ.efficientSha256(a, b);
        b = SSZ.efficientSha256(c, d);
        return SSZ.efficientSha256(a,b);
    }

    /// @dev Returns the fork at a given slot
    function _slotToFork(uint64 _slot) internal view returns (Fork) {
        if (_slot >= slotElectra) return Fork.ELECTRA;
        if (_slot >= slotDeneb) return Fork.DENEB;
        if (_slot >= slotCapella) return Fork.CAPELLA;
        if (_slot >= slotBellatrix) return Fork.BELLATRIX;
        if (_slot >= slotAltair) return Fork.ALTAIR;
        return Fork.PHASE_0;
    }

    /// @dev Returns a partial gindex from a BeaconBlockHeader -> state_root
    function _pathBeaconBlockHeaderToStateRoot() internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(3, 3); // 0b011 (BeaconBlockHeader -> state_root)
        return path;
    }

    /// @dev Returns a partial gindex from a BeaconState -> validators[n]
    function _pathBeaconStateToValidator(uint40 _validatorIndex) internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(11, 6); // 0b001011 (BeaconState -> validators)
        path = SSZ.concat(path, SSZ.intoList(_validatorIndex, 40)); // validators -> validators[n]
        return path;
    }

    /// @dev Returns a partial gindex from a BeaconState -> slot
    function _pathBeaconStateToSlot() internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(2, 6); // 0b000010 (BeaconState -> slot)
        return path;
    }

    /// @dev Returns a partial gindex from BeaconState -> block_roots[n] (via historical_summaries if required)
    function _pathBeaconStateToPastBlockRoot(uint64 _slot, uint64 _pastSlot) internal view returns (SSZ.Path memory) {
        bool isHistorical = _isHistoricalProof(_slot, _pastSlot);
        SSZ.Path memory path;
        if (isHistorical) {
            path = SSZ.concat(path, SSZ.from(27, 6)); // 0b001011 (BeaconState -> historical_summaries)
            path = SSZ.concat(path, SSZ.intoList(uint248(uint256(_pastSlot) / slotsPerHistoricalRoot - historicalSummaryOffset), 24)); // historical_summaries -> historical_summaries[n]
            path = SSZ.concat(path, SSZ.from(0, 1)); // 0b0 (HistoricalSummary -> block_summary_root)
        } else {
            path = SSZ.concat(path, SSZ.from(5, 6)); // 0b000101 (BeaconState -> block_roots)
        }
        path = SSZ.concat(path, SSZ.intoVector(uint248(_pastSlot % slotsPerHistoricalRoot), 13)); // block_roots -> block_roots[n]
        return path;
    }

    /// @dev Returns a partial gindex from BeaconBlockHeader -> withdrwals[n]
    function _pathBlockToWithdrawal(uint16 _withdrawalNum) internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(4, 3); // 0b100 (BeaconBlockHeader -> body_root)
        path = SSZ.concat(path, SSZ.from(9, 4)); // 0b1001 (BeaconBlockBody -> execution_payload)
        path = SSZ.concat(path, SSZ.from(14, 5)); // 0b01110 (ExecutionPayload -> withdrawals)
        path = SSZ.concat(path, SSZ.intoList(_withdrawalNum, 4)); // withdrawals -> withdrawals[n]
        return path;
    }
}
