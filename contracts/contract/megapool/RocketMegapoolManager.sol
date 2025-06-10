// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal, WithdrawalProof} from "../../interface/util/BeaconStateVerifierInterface.sol";

/// @notice Manages the global list of validators across all megapools
contract RocketMegapoolManager is RocketBase, RocketMegapoolManagerInterface {

    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the total number validators across all megapools
    function getValidatorCount() override external view returns (uint256) {
        return getUint(keccak256("megapool.validator.set.count"));
    }

    /// @notice Adds a validator record to the global megapool validator set
    /// @param _megapoolAddress Address of the megapool which manages this validator
    /// @param _validatorId Internal validator ID of the new validator
    function addValidator(address _megapoolAddress, uint32 _validatorId) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        uint256 index = getUint(keccak256("megapool.validator.set.count"));
        setUint(keccak256("megapool.validator.set.count"), index + 1);
        uint256 encoded = (uint256(uint160(_megapoolAddress)) << 96) | uint32(_validatorId);
        setUint(keccak256(abi.encodePacked("megapool.validator.set", index)), encoded);
    }

    /// @notice Returns validator info for the given global megapool validator index
    /// @param _index The index of the validator to query
    function getValidatorInfo(uint256 _index) override external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId) {
        uint256 encoded = getUint(keccak256(abi.encodePacked("megapool.validator.set", _index)));
        megapool = address(uint160(encoded >> 96));
        validatorId = uint32(encoded);

        RocketMegapoolInterface rocketMegapool = RocketMegapoolInterface(megapool);
        return (rocketMegapool.getValidatorInfo(validatorId), megapool, validatorId);
    }

    /// @notice Verifies a validator state proof then calls stake on the megapool
    function stake(RocketMegapoolInterface megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify matching withdrawal credentials
        bytes32 withdrawalCredentials = megapool.getWithdrawalCredentials();
        require(_proof.validator.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        // Verify matching pubkey
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = megapool.getValidatorInfo(_validatorId);
        require(keccak256(_proof.validator.pubkey) == keccak256(validatorInfo.pubKey));
        // Perform the stake
        megapool.stake(_validatorId, _proof.validatorIndex);
    }

    /// @notice Verifies a validator state proof then notifies megapool about the exit
    function notifyExit(RocketMegapoolInterface megapool, uint32 _validatorId, ValidatorProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Verify correct withdrawable_epoch
        require(_proof.validator.withdrawableEpoch < farFutureEpoch, "Validator is not exiting");
        // Verify matching validator index
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = megapool.getValidatorInfo(_validatorId);
        require(_proof.validatorIndex == validatorInfo.validatorIndex, "Invalid proof");
        // Notify megapool
        megapool.notifyExit(_validatorId, _proof.validator.withdrawableEpoch);
    }

    /// @notice Verifies a withdrawal state proof then notifies megapool of the final balance
    function notifyFinalBalance(RocketMegapoolInterface megapool, uint32 _validatorId, WithdrawalProof calldata _proof) override external {
        // Verify state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyWithdrawal(_proof), "Invalid proof");
        // Verify matching validator index
        RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo = megapool.getValidatorInfo(_validatorId);
        require(_proof.withdrawal.validatorIndex == validatorInfo.validatorIndex, "Invalid proof");
        // Notify megapool
        megapool.notifyFinalBalance(_validatorId, _proof.withdrawal.amountInGwei, msg.sender);
    }
}
