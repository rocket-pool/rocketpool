// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {SSZ} from "./SSZ.sol";
import {BlockRootsInterface} from "../../interface/util/BlockRootsInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Validator, WithdrawalProof, Withdrawal} from "../../interface/util/BeaconStateVerifierInterface.sol";

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
    constructor(RocketStorageInterface _rocketStorageAddress, uint256 _slotsPerHistoricalRoot, uint64[5] memory _forkSlots) RocketBase(_rocketStorageAddress) {
        version = 1;
        slotsPerHistoricalRoot = _slotsPerHistoricalRoot;
        // Set fork slots
        slotPhase0 = 0;
        slotAltair = _forkSlots[0];
        slotBellatrix = _forkSlots[1];
        slotCapella = _forkSlots[2];
        slotDeneb = _forkSlots[3];
        slotElectra = _forkSlots[4];
        // Historical summaries started being appended from Capella onwards, depending on the chain we might need an offset
        historicalSummaryOffset = slotCapella / slotsPerHistoricalRoot;
    }

    /// @notice Verifies a proof about a validator on the beacon chain
    function verifyValidator(ValidatorProof calldata _proof) override external view returns(bool) {
        // Only support post-electra state proofs
        require(_proof.slot >= slotElectra, "Invalid proof");
        // Construct gindex
        SSZ.Path memory path = pathBeaconBlockHeaderToStateRoot();
        path = SSZ.concat(path, pathBeaconStateToValidator(_proof.validatorIndex));
        // Restore the block root for the supplied slot
        bytes32 computedRoot = SSZ.restoreMerkleRoot(merkleiseValidator(_proof.validator), SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = getBlockRoot(_proof.slot);
        return computedRoot == root;
    }

    /// @notice Verifies a proof about the existence of a withdrawal on the beacon chain
    function verifyWithdrawal(WithdrawalProof calldata _proof) override external view returns(bool) {
        // Only support post-electra state proofs
        require(_proof.slot >= slotElectra, "Invalid proof");
        require(_proof.withdrawalSlot >= slotElectra, "Invalid proof");
        // Construct gindex
        SSZ.Path memory path = pathBeaconBlockHeaderToStateRoot();
        path = SSZ.concat(path, pathBeaconStateToPastBlockRoot(_proof.slot, _proof.withdrawalSlot));
        path = SSZ.concat(path, pathBlockToWithdrawal(_proof.withdrawalNum));
        // Merkleise the withdrawal struct
        bytes32 leaf = merkleiseWithdrawal(_proof.withdrawal);
        // Restore the block root for the supplied slot
        bytes32 computedRoot = SSZ.restoreMerkleRoot(leaf, SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = getBlockRoot(_proof.slot);
        return computedRoot == root;
    }

    /// @dev Gets the block root for a given slot
    function getBlockRoot(uint64 _slot) internal view returns (bytes32) {
        BlockRootsInterface blockRoots = BlockRootsInterface(getContractAddress("blockRoots"));
        return blockRoots.getBlockRoot(_slot);
    }

    /// @dev Returns whether the target slot is older than SLOTS_PER_HISTORICAL_ROOT indicating a proof must be for an older slot
    function isHistoricalProof(uint64 proofSlot, uint64 targetSlot) internal view returns (bool) {
        require(proofSlot >= targetSlot, "Invalid slot for proof");
        return targetSlot + slotsPerHistoricalRoot < proofSlot;
    }

    /// @dev Returns the SSZ merkle root of a given withdrawal container
    function merkleiseWithdrawal(Withdrawal calldata withdrawal) internal view returns (bytes32) {
        bytes32 left = SSZ.efficientSha256(SSZ.toLittleEndian(withdrawal.index), SSZ.toLittleEndian(withdrawal.validatorIndex));
        bytes32 right = SSZ.efficientSha256(withdrawal.withdrawalCredentials, SSZ.toLittleEndian(withdrawal.amountInGwei));
        return SSZ.efficientSha256(left, right);
    }

    /// @dev Returns the SSZ merkle root of a given validator
    function merkleiseValidator(Validator calldata validator) internal view returns (bytes32) {
        bytes32 a = SSZ.efficientSha256(SSZ.merkleisePubkey(validator.pubkey), validator.withdrawalCredentials);
        bytes32 b = SSZ.efficientSha256(SSZ.toLittleEndian(validator.effectiveBalance), SSZ.toLittleEndian(validator.slashed ? 1 : 0));
        bytes32 c = SSZ.efficientSha256(SSZ.toLittleEndian(uint256(validator.activationEligibilityEpoch)), SSZ.toLittleEndian(uint256(validator.activationEpoch)));
        bytes32 d = SSZ.efficientSha256(SSZ.toLittleEndian(uint256(validator.exitEpoch)), SSZ.toLittleEndian(uint256(validator.withdrawableEpoch)));
        a = SSZ.efficientSha256(a, b);
        b = SSZ.efficientSha256(c, d);
        return SSZ.efficientSha256(a,b);
    }

    /// @dev Returns the fork at a given slot
    function slotToFork(uint64 _slot) internal view returns (Fork) {
        if (_slot >= slotElectra) return Fork.ELECTRA;
        if (_slot >= slotDeneb) return Fork.DENEB;
        if (_slot >= slotCapella) return Fork.CAPELLA;
        if (_slot >= slotBellatrix) return Fork.BELLATRIX;
        if (_slot >= slotAltair) return Fork.ALTAIR;
        return Fork.PHASE_0;
    }

    /// @dev Returns a partial gindex from a BeaconBlockHeader -> state_root
    function pathBeaconBlockHeaderToStateRoot() internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(3, 3); // 0b011 (BeaconBlockHeader -> state_root)
        return path;
    }

    /// @dev Returns a partial gindex from a BeaconState -> validators[n]
    function pathBeaconStateToValidator(uint256 _validatorIndex) internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(11, 6); // 0b001011 (BeaconState -> validators)
        path = SSZ.concat(path, SSZ.intoVector(_validatorIndex, 40)); // validators -> validators[n]
        return path;
    }

    /// @dev Returns a partial gindex from BeaconState -> block_roots[n] (via historical_summaries if required)
    function pathBeaconStateToPastBlockRoot(uint64 _slot, uint64 _pastSlot) internal view returns (SSZ.Path memory) {
        bool isHistorical = isHistoricalProof(_slot, _pastSlot);
        SSZ.Path memory path;
        if (isHistorical) {
            path = SSZ.concat(path, SSZ.from(27, 6)); // 0b001011 (BeaconState -> historical_summaries)
            path = SSZ.concat(path, SSZ.intoVector(uint256(_pastSlot) / slotsPerHistoricalRoot - historicalSummaryOffset, 24)); // historical_summaries -> historical_summaries[n]
            path = SSZ.concat(path, SSZ.from(0, 1)); // 0b0 (HistoricalSummary -> block_summary_root)
        } else {
            path = SSZ.concat(path, SSZ.from(5, 6)); // 0b000101 (BeaconState -> block_roots)
        }
        path = SSZ.concat(path, SSZ.intoList(uint256(_pastSlot) % slotsPerHistoricalRoot, 13)); // block_roots -> block_roots[n]
        return path;
    }

    /// @dev Returns a partial gindex from BeaconBlockHeader -> withdrwals[n]
    function pathBlockToWithdrawal(uint256 _withdrawalNum) internal view returns (SSZ.Path memory) {
        SSZ.Path memory path = SSZ.from(4, 3); // 0b100 (BeaconBlockHeader -> body_root)
        path = SSZ.concat(path, SSZ.from(9, 4)); // 0b1001 (BeaconBlockBody -> execution_payload)
        path = SSZ.concat(path, SSZ.from(14, 5)); // 0b01110 (ExecutionPayload -> withdrawals)
        path = SSZ.concat(path, SSZ.intoList(_withdrawalNum, 5)); // withdrawals -> withdrawals[n]
        return path;
    }
}
