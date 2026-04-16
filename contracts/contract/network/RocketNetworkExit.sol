// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {ValidatorProof, SlotProof, BeaconStateVerifierInterface} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkExitInterface} from "../../interface/network/RocketNetworkExitInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/***
 * Notes:
 * - NO could potentially ping pong between Minipool versions to avoid a force exit
 * - Do we need to handle Megapool delegates that don't support force exits?
 * - How to handle Megapool bond changing between exit request and actual exit?
 */

/// @notice Handles cooperative and forced exits of Minipool and Megapool validators
contract RocketNetworkExit is RocketBase, RocketNetworkExitInterface {
    // Events
    event MegapoolExitRequested(address indexed megapoolAddress, uint256 indexed _validatorId, bytes pubkey);
    event MinipoolExitRequested(address indexed minipoolAddress, bytes pubkey);
    event MinipoolPenalised(address indexed minipoolAddress, uint256 _amount);

    // Constants
    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;
    uint256 constant internal slotRecencyThreshold = 1 hours;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the amount of ETH expected to exit
    function getRequestedEth() override public view returns (uint256) {
        return getUint(keccak256(bytes("exit.requested.eth")));
    }

    /// @notice Returns the start of the cooperative exit phase for a given Minipool
    /// @param _minipoolAddress The address of the Minipool
    function getMinipoolCooperativeExitStart(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("exit.request.minipool.time", _minipoolAddress)));
    }

    /// @notice Returns the start of the cooperative exit phase for a given Megapool validator
    /// @param _megapoolAddress The address of the Megapool owning the validator
    /// @param _validatorId The internal ID of the validator within the Megapool
    function getMegapoolCooperativeExitStart(address _megapoolAddress, uint32 _validatorId) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("exit.request.megapool.time", _megapoolAddress, _validatorId)));
    }

    /// @notice Returns the timestamp of the last exit request for a Minipool (or 0 if never requested)
    /// @param _minipoolAddress The address of the Minipool
    function getMinipoolLastExit(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("exit.failed.minipool.time", _minipoolAddress)));
    }

    /// @notice Requests a specific Minipool to exit cooperatively
    /// @param _minipoolAddress The address of the Minipool
    function requestMinipoolExit(address _minipoolAddress) override external onlyLatestNetworkContract {
        // Check this Minipool is clear to exit
        require(getMinipoolCooperativeExitStart(_minipoolAddress) == 0, "Minipool already requested to exit");
        require(block.timestamp >= getMinipoolLastExit(_minipoolAddress) + getDidNotExitCooldown(), "Not enough time has passed");
        // Get contracts
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        RocketMinipoolManagerInterface minipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Start the cooperative exit timer and set last exit attempt
        startMinipoolCooperativeExit(_minipoolAddress);
        setMinipoolLastExit(_minipoolAddress);
        // Increment requested ETH value
        uint256 validatorBond = minipool.getUserDepositBalance();
        increaseRequestedEth(validatorBond, minipoolRequestedEthKey(_minipoolAddress));
        // Emit events
        bytes memory pubkey = minipoolManager.getMinipoolPubkey(_minipoolAddress);
        emit MinipoolExitRequested(_minipoolAddress, pubkey);
    }

    /// @notice Forces a Minipool to exit if they have failed to exit cooperatively and their delegate supports an EL triggered exits
    /// @param _minipoolAddress The address of the Minipool
    function forceMinipoolExit(address _minipoolAddress) override public {
        // Check that the cooperative exit time has been satisfied
        validateMinipoolCooperativeExit(_minipoolAddress, block.timestamp);
        // Check if the Minipool supports force exits (otherwise caller should use `penaliseMinipool` instead)
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        uint8 version = minipool.version();
        require(version == 4, "Delegate does not support force exit");
        // TODO: Call force exit on new delegate
        // Decrease requested ETH
        decreaseRequestedEth(minipoolRequestedEthKey(_minipoolAddress));
    }

    /// @notice Penalises a Minipool if they have failed to cooperatively exit (or falls back to force exit if it supports EL triggered exits)
    /// @param _minipoolAddress The address of the Minipool
    /// @param _slotTimestamp Timestamp of the slot for which the validator proof was generated against
    /// @param _validatorProof Proof of the beacon state of the validator
    /// @param _slotProof A slot proof for the slot which the validator proof was generated against
    function penaliseMinipool(address _minipoolAddress, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Check if the Minipool supports force exits
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        uint8 version = minipool.version();
        if (version == 4) {
            // Instead of reverting here, we can fallback to a force exit
            // This prevents the NO from frontrunning a penalise call with a delegate fallback to make it revert
            forceMinipoolExit(_minipoolAddress);
            return;
        }
        // Check that the cooperative exit time has been satisfied
        validateMinipoolCooperativeExit(_minipoolAddress, _slotTimestamp);
        // Get the validator pubkey
        RocketMinipoolManagerInterface minipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        bytes memory pubkey = minipoolManager.getMinipoolPubkey(_minipoolAddress);
        // Verify the proofs
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Validate the proof
        require(_validatorProof.validator.exitEpoch == farFutureEpoch);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Incorrect validator");
        // Apply penalty to the Minipool
        applyMinipoolPenalty(_minipoolAddress);
        // Decrease requested ETH
        decreaseRequestedEth(minipoolRequestedEthKey(_minipoolAddress));
        // Clear the cooperative exit start timer so a future attempt can be made
        clearMinipoolCooperativeExit(_minipoolAddress);
    }

    /// @dev Requests that a Megapool validator be exited
    /// @param _megapoolAddress Address of the Megapool which owns the validator
    /// @param _validatorId Internal ID of the validator for the given Megapool
    function requestMegapoolExit(address _megapoolAddress, uint32 _validatorId) override external onlyLatestNetworkContract {
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        bytes memory pubkey = megapool.getValidatorPubkey(_validatorId);
        // Start the cooperative exit timer
        startMegapoolCooperativeExit(_megapoolAddress, _validatorId);
        // Increment requested ETH value by the expected returned bond amount
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(megapool.getActiveValidatorCount() - 1);
        uint256 effectiveBond = megapool.getNodeBond() + megapool.getNodeQueuedBond();
        uint256 validatorBond = effectiveBond - newBondRequirement;
        increaseRequestedEth(validatorBond, megapoolRequestedEthKey(_megapoolAddress, _validatorId));
        // Emit event
        emit MegapoolExitRequested(_megapoolAddress, _validatorId, pubkey);
    }

    /// @dev Triggers an EL exit for a Megapool validator if cooperative exit was not performed
    /// @param _megapoolAddress Address of the Megapool owning the validator
    /// @param _validatorId Internal ID of the validator within the Megapool
    function forceMegapoolExit(address _megapoolAddress, uint32 _validatorId) override public {
        // Check that the cooperative exit time has been satisfied
        validateMegapoolCooperativeExit(_megapoolAddress, _validatorId);
        // Force exit the validator
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        uint32[] memory validatorIds = new uint32[](1);
        validatorIds[0] = _validatorId;
        megapool.forceExit(validatorIds, getForceExitFeeLimit());
        // Decrease requested ETH
        decreaseRequestedEth(megapoolRequestedEthKey(_megapoolAddress, _validatorId));
    }

    function increaseRequestedEth(uint256 _amount, bytes32 _key) internal {
        addUint(keccak256(bytes("exit.requested.eth")), _amount);
        setUint(_key, _amount);
    }

    function decreaseRequestedEth(bytes32 _key) internal {
        uint256 amount = getUint(_key);
        subUint(keccak256(bytes("exit.requested.eth")), amount);
        deleteUint(_key);
    }

    function startMinipoolCooperativeExit(address _minipoolAddress) internal {
        setUint(keccak256(abi.encodePacked("exit.request.minipool.time", _minipoolAddress)), block.timestamp);
    }

    function setMinipoolLastExit(address _minipoolAddress) internal {
        setUint(keccak256(abi.encodePacked("exit.last.minipool.time", _minipoolAddress)), block.timestamp);
    }

    function clearMinipoolCooperativeExit(address _minipoolAddress) internal {
        deleteUint(keccak256(abi.encodePacked("exit.request.minipool.time", _minipoolAddress)));
    }

    function startMegapoolCooperativeExit(address _megapoolAddress, uint32 _validatorId) internal {
        setUint(keccak256(abi.encodePacked("exit.request.megapool.time", _megapoolAddress, _validatorId)), block.timestamp);
    }

    /// @dev Returns the "cooperative exit" deadline a NO has to exit on their own before being forced
    function getCooperativeExitPhase() internal view returns (uint256) {
        return getNetworkSettings().getCooperativeExitPhase();
    }

    /// @dev Returns the penalty in ETH for not exiting when requested
    function getDidNotExitPenalty() internal view returns (uint256) {
        return getNetworkSettings().getDidNotExitPenalty();
    }

    /// @dev Returns the penalty in ETH for not exiting when requested
    function getDidNotExitCooldown() internal view returns (uint256) {
        return getNetworkSettings().getDidNotExitCooldown();
    }

    function getNetworkSettings() internal view returns (RocketDAOProtocolSettingsNetworkInterface) {
        return RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
    }

    function getForceExitFeeLimit() internal view returns (uint256) {
        // TODO: Decide how to handle this
        return 10 wei;
    }

    /// @dev Reverts if Minipool has not been requested to exit or the cooperative exit phase has not been waited
    function validateMinipoolCooperativeExit(address _minipoolAddress, uint256 _timestamp) internal {
        uint256 requestTime = getMinipoolCooperativeExitStart(_minipoolAddress);
        require(requestTime != 0, "Force exit has not been requested");
        require(requestTime <= _timestamp - getCooperativeExitPhase(), "Not enough time has passed");
    }

    /// @dev Reverts if Megapool validator has not been requested to exit or the cooperative exit phase has not been waited
    function validateMegapoolCooperativeExit(address _megapoolAddress, uint32 _validatorId) internal {
        uint256 requestTime = getMegapoolCooperativeExitStart(_megapoolAddress, _validatorId);
        require(requestTime != 0, "Force exit has not been requested");
        require(requestTime <= block.timestamp - getCooperativeExitPhase(), "Not enough time has passed");
    }

    /// @dev Increases the penalty rate on a Minipool by the "did not exit penalty"
    /// @param _minipoolAddress Address of the Minipool to penalise
    function applyMinipoolPenalty(address _minipoolAddress) internal {
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        // Minipool penalties are implemented as a percentage, so reverse calculate the required rate to apply the desired fixed amount
        uint256 penaltyAmount = getDidNotExitPenalty();
        uint256 nodeShare = minipool.getNodeDepositBalance();
        // rate = penaltyAmount / nodeShare
        uint256 penaltyRate = penaltyAmount * calcBase / nodeShare;
        addUint(keccak256(abi.encodePacked("minipool.penalty.rate", _minipoolAddress)), penaltyRate);
        // Emit event
        emit MinipoolPenalised(_minipoolAddress, penaltyAmount);
    }

    function megapoolRequestedEthKey(address _megapoolAddress, uint32 _validatorId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.requested.eth.megapool", _megapoolAddress, _validatorId));
    }

    function minipoolRequestedEthKey(address _minipoolAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.requested.eth.minipool", _minipoolAddress));
    }
}