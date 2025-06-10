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
        // Set to mainnet values for use in unit tests with real proofs
        uint64[5] memory forkSlots;
        forkSlots[0] = 74240 * 32;
        forkSlots[1] = 144896 * 32;
        forkSlots[2] = 194048 * 32;
        forkSlots[3] = 269568 * 32;
        forkSlots[4] = 364032 * 32;
        verifier = new BeaconStateVerifier(_rocketStorageAddress, 8192, forkSlots);
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

    function verifyWithdrawal(WithdrawalProof calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyWithdrawal(_proof);
    }
}
