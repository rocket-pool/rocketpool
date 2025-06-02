// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {SSZ} from "./SSZ.sol";
import {BlockRootsInterface} from "../../interface/util/BlockRootsInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal} from "../../interface/util/BeaconStateVerifierInterface.sol";

contract BeaconStateVerifier is RocketBase, BeaconStateVerifierInterface {
    // TODO: Decide how to supply these required beacon chain constants
    uint256 internal constant SLOTS_PER_HISTORICAL_ROOT = 8192;
    uint256 internal constant HISTORICAL_ROOT_OFFSET = 758; // CAPELLA_FORK_EPOCH * 32 / SLOTS_PER_HISTORICAL_ROOT

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    function verifyValidator(ValidatorProof calldata _proof) override external view returns(bool) {
        // TODO: Extract this out into a parameterised system for updating the gindices alongside hardforks
        SSZ.Path memory path = SSZ.from(3, 3); // 0b011 (BeaconBlockHeader -> state_root)
        path = SSZ.concat(path, SSZ.from(11, 6)); // 0b001011 (BeaconState -> validators)
        path = SSZ.concat(path, SSZ.intoVector(_proof.validatorIndex, 40)); // validators -> validators[n]
        path = SSZ.concat(path, SSZ.from(0, 2)); // 0b00 (Validator -> pubkey/withdrawal_credentials)
        // Compute the withdrawal credential / pubkey branch root
        bytes32 pubkeyRoot = SSZ.merkleisePubkey(_proof.pubkey);
        bytes32 pubkeyWithdrawalCredentialsRoot = SSZ.efficientSha256(pubkeyRoot, _proof.withdrawalCredentials);
        // Restore the block root for the supplied slot
        bytes32 computedRoot = SSZ.restoreMerkleRoot(pubkeyWithdrawalCredentialsRoot, SSZ.toIndex(path), _proof.witnesses);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = getBlockRoot(_proof.slot);
        return computedRoot == root;
    }

    function verifyExit(uint256 _validatorIndex, uint256 _withdrawableEpoch, uint64 _slot, bytes32[] calldata _proof) override external view returns(bool) {
        // TODO: Extract this out into a parameterised system for updating the gindices alongside hardforks
        SSZ.Path memory path = SSZ.from(3, 3); // 0b011 (BeaconBlockHeader -> state_root)
        path = SSZ.concat(path, SSZ.from(11, 6)); // 0b001011 (BeaconState -> validators)
        path = SSZ.concat(path, SSZ.intoVector(_validatorIndex, 40)); // validators -> validators[n]
        path = SSZ.concat(path, SSZ.from(7, 3)); // 0b111 (Validator -> withdrawable_epoch)
        // Compute the withdrawable epoch leaf
        bytes32 leaf = SSZ.toLittleEndian(_withdrawableEpoch);
        // Restore the block root for the supplied slot
        bytes32 computedRoot = SSZ.restoreMerkleRoot(leaf, SSZ.toIndex(path), _proof);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = getBlockRoot(_slot);
        return computedRoot == root;
    }

    function verifyWithdrawal(uint256 _validatorIndex, uint64 _withdrawalSlot, uint256 _withdrawalNum, Withdrawal calldata _withdrawal, uint64 _slot, bytes32[] calldata _proof) override external view returns(bool) {
        bool isHistorical = isHistoricalProof(_slot, _withdrawalSlot);
        // TODO: Extract this out into a parameterised system for updating the gindices alongside hardforks
        SSZ.Path memory path = SSZ.from(3, 3); // 0b011 (BeaconBlockHeader -> state_root)
        if (isHistorical) {
            path = SSZ.concat(path, SSZ.from(27, 6)); // 0b001011 (BeaconState -> historical_summaries)
            path = SSZ.concat(path, SSZ.intoVector(uint256(_withdrawalSlot) / SLOTS_PER_HISTORICAL_ROOT - HISTORICAL_ROOT_OFFSET, 24)); // historical_summaries -> historical_summaries[n]
            path = SSZ.concat(path, SSZ.from(0, 1)); // 0b0 (HistoricalSummary -> block_summary_root)
        } else {
            path = SSZ.concat(path, SSZ.from(5, 6)); // 0b000101 (BeaconState -> block_roots)
        }
        path = SSZ.concat(path, SSZ.intoList(uint256(_withdrawalSlot) % SLOTS_PER_HISTORICAL_ROOT, 13)); // block_roots -> block_roots[n]
        path = SSZ.concat(path, SSZ.from(4, 3)); // 0b100 (BeaconBlockHeader -> body_root)
        path = SSZ.concat(path, SSZ.from(9, 4)); // 0b1001 (BeaconBlockBody -> execution_payload)
        path = SSZ.concat(path, SSZ.from(14, 5)); // 0b01110 (ExecutionPayload -> withdrawals)
        path = SSZ.concat(path, SSZ.intoList(_withdrawalNum, 5)); // withdrawals -> withdrawals[n]
        // Merkleise the withdrawal struct
        bytes32 leaf = merkleiseWithdrawal(_withdrawal);
        // Restore the block root for the supplied slot
        bytes32 computedRoot = SSZ.restoreMerkleRoot(leaf, SSZ.toIndex(path), _proof);
        // Retrieve and compare the root with what we determined it should be from the given proof
        bytes32 root = getBlockRoot(_slot);
        return computedRoot == root;
    }

    function getBlockRoot(uint64 _slot) internal view returns (bytes32) {
        BlockRootsInterface blockRoots = BlockRootsInterface(getContractAddress("blockRoots"));
        return blockRoots.getBlockRoot(_slot);
    }

    function isHistoricalProof(uint64 proofSlot, uint64 targetSlot) internal view returns (bool) {
        require(proofSlot > targetSlot, "Invalid slot for proof");
        return targetSlot + SLOTS_PER_HISTORICAL_ROOT < proofSlot;
    }

    function merkleiseWithdrawal(Withdrawal calldata withdrawal) internal view returns (bytes32) {
        bytes32 left = SSZ.efficientSha256(SSZ.toLittleEndian(withdrawal.index), SSZ.toLittleEndian(withdrawal.validatorIndex));
        bytes32 right = SSZ.efficientSha256(withdrawal.withdrawalCredentials, SSZ.toLittleEndian(withdrawal.amountInGwei));
        return SSZ.efficientSha256(left, right);
    }
}
