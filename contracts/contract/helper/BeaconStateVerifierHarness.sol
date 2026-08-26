// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {
    ValidatorProof,
    WithdrawalProof,
    SlotProof,
    NextWithdrawalIndexProof,
    ValidatorBalanceProof
} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {BeaconStateVerifier} from "../util/BeaconStateVerifier.sol";

/// @dev NOT USED IN PRODUCTION - Exposes internal verifier methods for tests
contract BeaconStateVerifierHarness is BeaconStateVerifier {
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        uint256 _slotsPerHistoricalRoot,
        uint64[7] memory _forkSlots,
        address _beaconRoots
    ) BeaconStateVerifier(_rocketStorageAddress, _slotsPerHistoricalRoot, _forkSlots, _beaconRoots) {}

    function verifyValidatorProof(
        uint64 _slotTimestamp,
        uint64 _slot,
        ValidatorProof calldata _proof
    ) external view returns (bool) {
        return _verifyValidator(_slotTimestamp, _slot, _proof);
    }

    function verifyWithdrawalProof(
        uint64 _slotTimestamp,
        uint64 _slot,
        WithdrawalProof calldata _proof
    ) external view returns (bool) {
        return _verifyWithdrawal(_slotTimestamp, _slot, _proof);
    }

    function verifySlotProof(
        uint64 _slotTimestamp,
        SlotProof calldata _proof
    ) external view returns (bool) {
        return _verifySlot(_slotTimestamp, _proof);
    }

    function verifyValidatorBalance(
        uint64 _slotTimestamp,
        uint64 _slot,
        uint64 _balanceSlot,
        uint40 _validatorIndex,
        ValidatorBalanceProof calldata _proof
    ) external view returns (bool) {
        return _verifyValidatorBalance(_slotTimestamp, _slot, _balanceSlot, _validatorIndex, _proof);
    }

    function verifyNextWithdrawalIndex(
        uint64 _slotTimestamp,
        uint64 _slot,
        uint64 _withdrawalSlot,
        NextWithdrawalIndexProof calldata _proof
    ) external view returns (bool) {
        return _verifyNextWithdrawalIndex(_slotTimestamp, _slot, _withdrawalSlot, _proof);
    }
}
