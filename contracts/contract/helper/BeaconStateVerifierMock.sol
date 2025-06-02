// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../interface/RocketStorageInterface.sol";
import "../../interface/util/BeaconStateVerifierInterface.sol";
import {BeaconStateVerifier} from "../util/BeaconStateVerifier.sol";

/// @dev NOT USED IN PRODUCTION - This contract only exists to bypass state proofs during tests
contract BeaconStateVerifierMock is BeaconStateVerifierInterface {
    bool private disabled = false;

    BeaconStateVerifierInterface private immutable verifier;

    constructor(RocketStorageInterface _rocketStorageAddress) {
        verifier = new BeaconStateVerifier(_rocketStorageAddress);
    }

    function setDisabled(bool _disabled) external {
        disabled = _disabled;
    }

    function verifyValidator(ValidatorProof calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyValidator(_proof);
    }

    function verifyExit(uint256 _validatorIndex, uint256 _withdrawableEpoch, uint64 _slot, bytes32[] calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyExit(_validatorIndex, _withdrawableEpoch, _slot, _proof);
    }

    function verifyWithdrawal(uint256 _validatorIndex, uint64 _withdrawalSlot, uint256 _withdrawalNum, Withdrawal calldata _withdrawal, uint64 _slot, bytes32[] calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyWithdrawal(_validatorIndex, _withdrawalSlot, _withdrawalNum, _withdrawal, _slot, _proof);
    }
}
