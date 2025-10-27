// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../interface/RocketStorageInterface.sol";
import "../../interface/util/BeaconStateVerifierInterface.sol";
import {BeaconStateVerifier} from "../util/BeaconStateVerifier.sol";

/// @dev NOT USED IN PRODUCTION - This contract only exists to bypass state proofs during tests
contract BeaconStateVerifierMock is BeaconStateVerifierInterface {
    bool private disabled = false;

    BeaconStateVerifierInterface private immutable verifier;

    mapping(uint256 => bytes32) internal beaconRoots;

    constructor(RocketStorageInterface _rocketStorageAddress) {
        // Set to mainnet values for use in unit tests with real proofs
        uint64[5] memory forkSlots;
        forkSlots[0] = 74240 * 32;
        forkSlots[1] = 144896 * 32;
        forkSlots[2] = 194048 * 32;
        forkSlots[3] = 269568 * 32;
        forkSlots[4] = 364032 * 32;
        verifier = new BeaconStateVerifier(_rocketStorageAddress, 8192, forkSlots, address(this), 1606824023, 0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95);
    }

    function setDisabled(bool _disabled) external {
        disabled = _disabled;
    }

    function verifyValidator(uint64 _slotTimestamp, uint64 _slot, ValidatorProof calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyValidator(_slotTimestamp, _slot, _proof);
    }

    function verifyWithdrawal(uint64 _slotTimestamp, uint64 _slot, WithdrawalProof calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifyWithdrawal(_slotTimestamp, _slot, _proof);
    }

    function verifySlot(uint64 _slotTimestamp, SlotProof calldata _proof) override external view returns(bool) {
        if (disabled) {
            return true;
        }
        return verifier.verifySlot(_slotTimestamp, _proof);
    }

    function setBlockRoot(uint256 _timestamp, bytes32 _root) external {
        beaconRoots[_timestamp] = _root;
    }

    fallback(bytes calldata _input) external returns (bytes memory) {
        uint256 timestamp = abi.decode(_input, (uint256));
        if (beaconRoots[timestamp] != 0) {
            return abi.encode(beaconRoots[timestamp]);
        }
        revert();
    }

}
