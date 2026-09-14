// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Math} from "@openzeppelin4/contracts/utils/math/Math.sol";

import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {MinipoolStatus} from "../../types/MinipoolStatus.sol";
import {ValidatorProof, SlotProof, BeaconStateVerifierInterface} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolStorageLayout} from "../megapool/RocketMegapoolStorageLayout.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkExitInterface} from "../../interface/network/RocketNetworkExitInterface.sol";
import {RocketNetworkPenaltiesInterface} from "../../interface/network/RocketNetworkPenaltiesInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Handles cooperative and forced exits of Minipool and Megapool validators
contract RocketNetworkExit is RocketBase, RocketNetworkExitInterface {

    // Events

    event MegapoolExitRequested(address indexed megapoolAddress, uint256 indexed _validatorId, bytes pubkey);
    event MinipoolExitRequested(address indexed minipoolAddress, bytes pubkey);
    event MinipoolPenalised(address indexed minipoolAddress, uint256 _amount);
    event MegapoolVoluntaryExitRecorded(address indexed megapoolAddress, uint256 indexed validatorId, uint256 expectedUserCapital);
    event MegapoolExitReconciled(address indexed megapoolAddress, uint256 indexed validatorId, ExitType exitType, uint256 expectedUserCapital);
    event MinipoolExitReconciled(address indexed minipoolAddress, uint256 expectedUserCapital);

    // Constants

    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;
    uint256 constant internal slotRecencyThreshold = 1 hours;
    uint256 constant internal validatorDeposit = 32 ether;

    // Immutables

    address payable immutable internal withdrawalRequestPredeployAddress;

    // Modifiers

    modifier onlyMinipoolExitRequester() {
        require(msg.sender == getContractAddress("rocketNetworkRedemptions"), "Invalid minipool exit requester");
        _;
    }

    modifier onlyMegapoolExitRequester() {
        require(
            msg.sender == getContractAddress("rocketNetworkRedemptions") ||
            msg.sender == getContractAddress("rocketNetworkParticipation"),
            "Invalid megapool exit requester"
        );
        _;
    }

    modifier onlyLatestMegapoolManager() {
        require(msg.sender == getContractAddress("rocketMegapoolManager"), "Invalid megapool manager");
        _;
    }

    // Construct

    constructor(RocketStorageInterface _rocketStorageAddress, address payable _withdrawalRequestPredeployAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
        withdrawalRequestPredeployAddress = _withdrawalRequestPredeployAddress;
    }

    /// @notice Returns the amount of ETH expected to exit
    function getRequestedEth() override public view returns (uint256) {
        return getUint(keccak256(bytes("exit.requested.eth")));
    }

    /// @notice Returns the amount of ETH expected from voluntarily exiting Megapool validators
    function getVoluntaryEth() override public view returns (uint256) {
        return getUint(keccak256(bytes("exit.voluntary.eth")));
    }

    /// @notice Returns the exact current EIP-7002 exit fee
    function getExitFee() override public view returns (uint256) {
        (bool result, bytes memory feeRaw) = withdrawalRequestPredeployAddress.staticcall("");
        require(result, "Withdrawal fee query failed");
        require(feeRaw.length == 32, "Invalid withdrawal fee response");
        return abi.decode(feeRaw, (uint256));
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
        return getUint(keccak256(abi.encodePacked("exit.last.minipool.time", _minipoolAddress)));
    }

    /// @notice Returns the number of times a Minipool has been requested to exit
    /// @param _minipoolAddress The address of the Minipool
    function getMinipoolExitRequestCount(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("exit.request.minipool.count", _minipoolAddress)));
    }

    /// @notice Returns the expected user capital snapshotted for a requested Minipool
    function getMinipoolExpectedUserCapital(address _minipoolAddress) override public view returns (uint256) {
        return getUint(minipoolExpectedUserCapitalKey(_minipoolAddress));
    }

    /// @notice Returns how a Megapool validator is currently accounted for
    function getMegapoolExitType(address _megapoolAddress, uint32 _validatorId) override public view returns (ExitType) {
        return ExitType(getUint(megapoolExitTypeKey(_megapoolAddress, _validatorId)));
    }

    /// @notice Returns the expected user capital snapshotted for a Megapool validator
    function getMegapoolExpectedUserCapital(address _megapoolAddress, uint32 _validatorId) override public view returns (uint256) {
        return getUint(megapoolExpectedUserCapitalKey(_megapoolAddress, _validatorId));
    }

    /// @notice Returns the number of requested and voluntary exits outstanding for a Megapool
    function getMegapoolOutstandingExitCount(address _megapoolAddress) override public view returns (uint256) {
        return getUint(megapoolOutstandingExitCountKey(_megapoolAddress));
    }

    /// @notice Requests a specific Minipool to exit cooperatively
    /// @param _minipoolAddress The address of the Minipool
    function requestMinipoolExit(address _minipoolAddress) override external onlyMinipoolExitRequester onlyRegisteredMinipool(_minipoolAddress) {
        // Check this Minipool is clear to exit
        require(getMinipoolCooperativeExitStart(_minipoolAddress) == 0, "Minipool already requested to exit");
        uint256 requestCount = getMinipoolExitRequestCount(_minipoolAddress);
        if (requestCount > 0) {
            uint256 delay = _applyBackoff(_getDidNotExitBase(), requestCount - 1);
            require(block.timestamp >= getMinipoolLastExit(_minipoolAddress) + delay, "Not enough time has passed");
        }
        // Get contracts
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        RocketMinipoolManagerInterface minipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        require(minipool.getStatus() == MinipoolStatus.Staking, "Minipool is not staking");
        require(!minipool.getFinalised(), "Minipool is finalised");
        require(!minipool.getUserDistributed(), "User capital already distributed");
        // Start the cooperative exit timer and set last exit attempt
        _startMinipoolCooperativeExit(_minipoolAddress);
        _setMinipoolLastExit(_minipoolAddress);
        _setMinipoolExitRequestCount(_minipoolAddress, requestCount + 1);
        // Increment requested ETH value
        uint256 expectedUserCapital = minipool.getUserDepositBalance();
        _increaseRequestedEth(expectedUserCapital, minipoolExpectedUserCapitalKey(_minipoolAddress));
        // Emit events
        bytes memory pubkey = minipoolManager.getMinipoolPubkey(_minipoolAddress);
        emit MinipoolExitRequested(_minipoolAddress, pubkey);
    }

    /// @notice Forces a Minipool to exit if they have failed to exit cooperatively and their delegate supports an EL triggered exits
    /// @param _minipoolAddress The address of the Minipool
    function forceMinipoolExit(address _minipoolAddress) override public payable onlyRegisteredMinipool(_minipoolAddress) {
        // Check that the cooperative exit time has been satisfied
        _validateMinipoolCooperativeExit(_minipoolAddress, block.timestamp);
        // Check if the Minipool supports force exits (otherwise caller should use `penaliseMinipool` instead)
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        uint8 version = minipool.version();
        require(version >= 4, "Delegate does not support force exit");
        bytes32 submittedKey = minipoolForceExitSubmittedKey(_minipoolAddress);
        require(!getBool(submittedKey), "Force exit already submitted");
        // Query and forward the exact fee so the predeploy does not retain an overpayment
        uint256 fee = getExitFee();
        require(msg.value >= fee, "Insufficient exit fee");
        // Set replay protection before external calls; all state is rolled back if submission or refund fails
        setBool(submittedKey, true);
        minipool.forceExit{value: fee}();
        _refundExcessExitFee(fee);
    }

    /// @notice Penalises a Minipool if they have failed to cooperatively exit (or falls back to force exit if it supports EL triggered exits)
    /// @param _minipoolAddress The address of the Minipool
    /// @param _slotTimestamp Timestamp of the slot for which the validator proof was generated against
    /// @param _validatorProof Proof of the beacon state of the validator
    /// @param _slotProof A slot proof for the slot which the validator proof was generated against
    function penaliseMinipool(address _minipoolAddress, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) override external payable onlyRegisteredMinipool(_minipoolAddress) {
        // Require a recent proof
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Check if the Minipool supports force exits
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        uint8 version = minipool.version();
        if (version >= 4) {
            // Instead of reverting here, we can fallback to a force exit
            // This prevents the NO from frontrunning a penalise call with a delegate fallback to make it revert
            forceMinipoolExit(_minipoolAddress);
            return;
        }
        require(msg.value == 0, "Unexpected exit fee");
        // Check that the cooperative exit time has been satisfied
        _validateMinipoolCooperativeExit(_minipoolAddress, _slotTimestamp);
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
        _applyMinipoolPenalty(_minipoolAddress);
        // Decrease requested ETH
        _decreaseRequestedEth(minipoolExpectedUserCapitalKey(_minipoolAddress));
        // Clear the cooperative exit start timer so a future attempt can be made
        _clearMinipoolCooperativeExit(_minipoolAddress);
    }

    /// @dev Requests that a Megapool validator be exited
    /// @param _megapoolAddress Address of the Megapool which owns the validator
    /// @param _validatorId Internal ID of the validator for the given Megapool
    function requestMegapoolExit(address _megapoolAddress, uint32 _validatorId) override external onlyMegapoolExitRequester onlyRegisteredMegapool(_megapoolAddress) {
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        (RocketMegapoolStorageLayout.ValidatorInfo memory validator, bytes memory pubkey) = megapool.getValidatorInfoAndPubkey(_validatorId);
        require(validator.staked, "Validator is not staking");
        require(!validator.dissolved, "Validator is dissolved");
        require(!validator.exiting, "Validator is exiting");
        require(!validator.exited, "Validator has exited");
        require(getMegapoolExitType(_megapoolAddress, _validatorId) == ExitType.None, "Validator exit already tracked");
        // Start the cooperative exit timer
        _startMegapoolCooperativeExit(_megapoolAddress, _validatorId);
        // Snapshot and account for the expected user capital
        uint256 expectedUserCapital = _calculateMegapoolExpectedUserCapital(megapool);
        _recordMegapoolExit(_megapoolAddress, _validatorId, ExitType.Requested, expectedUserCapital);
        // Emit event
        emit MegapoolExitRequested(_megapoolAddress, _validatorId, pubkey);
    }

    /// @dev Triggers an EL exit for a Megapool validator if cooperative exit was not performed
    /// @param _megapoolAddress Address of the Megapool owning the validator
    /// @param _validatorId Internal ID of the validator within the Megapool
    function forceMegapoolExit(address _megapoolAddress, uint32 _validatorId) override external payable onlyRegisteredMegapool(_megapoolAddress) {
        // Check that the cooperative exit time has been satisfied
        _validateMegapoolCooperativeExit(_megapoolAddress, _validatorId);
        // Force exit the validator using the common caller-funded execution path
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        uint32[] memory validatorIds = new uint32[](1);
        validatorIds[0] = _validatorId;
        _forceMegapoolValidators(megapool, validatorIds);
    }

    /// @notice Permissionlessly resubmits an EL exit for a validator already marked as exiting
    /// @dev Success means the request was queued, not that consensus accepted the exit. The caller funds the current fee.
    /// @param _megapoolAddress Address of the Megapool owning the validator
    /// @param _validatorId Internal ID of the validator within the Megapool
    function retryMegapoolExit(address _megapoolAddress, uint32 _validatorId) override external payable onlyRegisteredMegapool(_megapoolAddress) {
        uint256 fee = getExitFee();
        require(msg.value >= fee, "Insufficient exit fee");
        RocketMegapoolInterface(_megapoolAddress).retryExit{value: fee}(_validatorId);
        _refundExcessExitFee(fee);
    }

    /// @notice Exits Megapool validators at the request of the node or its withdrawal address, or permissionlessly when the deficit permits
    /// @dev Other callers require the projected deficit before the last requested exit to be at least the RPIP-44 exit deficit
    /// @param _megapoolAddress Address of the Megapool owning the validators
    /// @param _validatorIds Internal IDs of the validators to exit
    function exitMegapoolValidators(address _megapoolAddress, uint32[] calldata _validatorIds) override external payable onlyRegisteredMegapool(_megapoolAddress) {
        uint256 numValidatorsToExit = _validatorIds.length;
        require(numValidatorsToExit > 0, "No validators supplied");
        // Get contracts
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        // Query validator counts
        uint256 totalExiting = numValidatorsToExit + megapool.getExitingValidatorCount();
        uint256 activeValidatorCount = megapool.getActiveValidatorCount();
        // Sanity check validator exit count
        require(totalExiting <= activeValidatorCount, "Too many validators to exit");
        // Skip deficit accounting for owners
        address nodeAddress = megapool.getNodeAddress();
        if (msg.sender != nodeAddress && msg.sender != rocketStorage.getNodeWithdrawalAddress(nodeAddress)) {
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
            RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
            RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
            // Query credit and rewards
            uint256 credit = rocketDepositPool.getNodeCreditBalance(nodeAddress);
            (uint256 rewards,,,) = megapool.calculatePendingRewards();
            // Account for existing exits and every proposed exit except the last
            // The last exit is allowed to bring the deficit below the threshold
            // Include queued bond because the active validator count includes queued validators
            // Clamp release to zero when underbonded and cap it by exiting principal and available node bond
            uint256 bondReleasedBeforeLast = _calculateReleasedNodeBond(
                megapool.getNodeBond() + megapool.getNodeQueuedBond(),
                megapool.getNodeBond(),
                rocketNodeDeposit.getBondRequirement(activeValidatorCount - (totalExiting - 1)),
                totalExiting - 1
            );
            uint256 projectedExcess = credit + rewards + bondReleasedBeforeLast;
            // Pending rewards exclude already-distributed funds available for refund
            projectedExcess += megapool.getRefundValue();
            // Include deposited node ETH available for validator deposits (RPIP-44 received funds)
            projectedExcess += rocketNodeDeposit.getNodeEthBalance(nodeAddress);
            require(megapool.getDebt() >= rocketDAOProtocolSettingsMegapool.getExitDeficit() + projectedExcess, "Deficit too low");
        }
        // Exit validators using the common caller-funded execution path
        _forceMegapoolValidators(megapool, _validatorIds);
    }

    /// @notice Records a successfully notified Megapool exit as voluntary unless it was already requested
    function notifyMegapoolExit(address _megapoolAddress, uint32 _validatorId) override external onlyLatestMegapoolManager onlyRegisteredMegapool(_megapoolAddress) {
        ExitType exitType = getMegapoolExitType(_megapoolAddress, _validatorId);
        if (exitType == ExitType.Requested) {
            return;
        }
        require(exitType == ExitType.None, "Validator exit already tracked");
        RocketMegapoolInterface megapool = RocketMegapoolInterface(_megapoolAddress);
        RocketMegapoolStorageLayout.ValidatorInfo memory validator = megapool.getValidatorInfo(_validatorId);
        require(validator.exiting && !validator.exited, "Validator is not exiting");
        // Dissolved validators have already had their capital reconciled and are not voluntary exits
        if (validator.dissolved) {
            return;
        }
        uint256 expectedUserCapital = _calculateMegapoolExpectedUserCapital(megapool);
        _recordMegapoolExit(_megapoolAddress, _validatorId, ExitType.Voluntary, expectedUserCapital);
        emit MegapoolVoluntaryExitRecorded(_megapoolAddress, _validatorId, expectedUserCapital);
    }

    /// @notice Reconciles a Megapool validator after its final balance has been processed
    function notifyMegapoolFinalBalance(address _megapoolAddress, uint32 _validatorId) override external onlyLatestMegapoolManager onlyRegisteredMegapool(_megapoolAddress) {
        ExitType exitType = getMegapoolExitType(_megapoolAddress, _validatorId);
        // Validators already exiting at upgrade time do not have an accounting record
        if (exitType == ExitType.None) {
            return;
        }
        uint256 expectedUserCapital = getMegapoolExpectedUserCapital(_megapoolAddress, _validatorId);
        if (exitType == ExitType.Requested) {
            subUint(keccak256(bytes("exit.requested.eth")), expectedUserCapital);
            _clearMegapoolCooperativeExit(_megapoolAddress, _validatorId);
        } else {
            subUint(keccak256(bytes("exit.voluntary.eth")), expectedUserCapital);
        }
        deleteUint(megapoolExpectedUserCapitalKey(_megapoolAddress, _validatorId));
        deleteUint(megapoolExitTypeKey(_megapoolAddress, _validatorId));
        subUint(megapoolOutstandingExitCountKey(_megapoolAddress), 1);
        emit MegapoolExitReconciled(_megapoolAddress, _validatorId, exitType, expectedUserCapital);
    }

    /// @notice Reconciles a requested Minipool once user capital has been distributed
    function settleMinipoolExit(address _minipoolAddress) override external onlyRegisteredMinipool(_minipoolAddress) {
        require(getMinipoolCooperativeExitStart(_minipoolAddress) != 0, "Minipool exit is not requested");
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipoolAddress);
        require(minipool.getFinalised() || minipool.getUserDistributed(), "Minipool has not distributed");
        uint256 expectedUserCapital = getMinipoolExpectedUserCapital(_minipoolAddress);
        _decreaseRequestedEth(minipoolExpectedUserCapitalKey(_minipoolAddress));
        _clearMinipoolCooperativeExit(_minipoolAddress);
        emit MinipoolExitReconciled(_minipoolAddress, expectedUserCapital);
    }

    // Internals

    function _increaseRequestedEth(uint256 _amount, bytes32 _key) internal {
        addUint(keccak256(bytes("exit.requested.eth")), _amount);
        setUint(_key, _amount);
    }

    function _decreaseRequestedEth(bytes32 _key) internal {
        uint256 amount = getUint(_key);
        subUint(keccak256(bytes("exit.requested.eth")), amount);
        deleteUint(_key);
    }

    function _startMinipoolCooperativeExit(address _minipoolAddress) internal {
        setUint(keccak256(abi.encodePacked("exit.request.minipool.time", _minipoolAddress)), block.timestamp);
    }

    function _setMinipoolLastExit(address _minipoolAddress) internal {
        setUint(keccak256(abi.encodePacked("exit.last.minipool.time", _minipoolAddress)), block.timestamp);
    }

    function _setMinipoolExitRequestCount(address _minipoolAddress, uint256 _count) internal {
        setUint(keccak256(abi.encodePacked("exit.request.minipool.count", _minipoolAddress)), _count);
    }

    function _clearMinipoolCooperativeExit(address _minipoolAddress) internal {
        deleteUint(keccak256(abi.encodePacked("exit.request.minipool.time", _minipoolAddress)));
        deleteBool(minipoolForceExitSubmittedKey(_minipoolAddress));
    }

    function _startMegapoolCooperativeExit(address _megapoolAddress, uint32 _validatorId) internal {
        setUint(keccak256(abi.encodePacked("exit.request.megapool.time", _megapoolAddress, _validatorId)), block.timestamp);
    }

    function _clearMegapoolCooperativeExit(address _megapoolAddress, uint32 _validatorId) internal {
        deleteUint(keccak256(abi.encodePacked("exit.request.megapool.time", _megapoolAddress, _validatorId)));
    }

    function _recordMegapoolExit(address _megapoolAddress, uint32 _validatorId, ExitType _exitType, uint256 _expectedUserCapital) internal {
        setUint(megapoolExitTypeKey(_megapoolAddress, _validatorId), uint256(_exitType));
        setUint(megapoolExpectedUserCapitalKey(_megapoolAddress, _validatorId), _expectedUserCapital);
        addUint(megapoolOutstandingExitCountKey(_megapoolAddress), 1);
        if (_exitType == ExitType.Requested) {
            addUint(keccak256(bytes("exit.requested.eth")), _expectedUserCapital);
        } else {
            addUint(keccak256(bytes("exit.voluntary.eth")), _expectedUserCapital);
        }
    }

    /// @dev Returns the expected user capital returned from exiting a Megapool validator
    function _calculateMegapoolExpectedUserCapital(RocketMegapoolInterface _megapool) internal view returns (uint256) {
        uint256 activeValidatorCount = _megapool.getActiveValidatorCount();
        uint256 outstandingExitCount = getMegapoolOutstandingExitCount(address(_megapool));
        require(outstandingExitCount < activeValidatorCount, "Too many outstanding exits");
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        uint256 releasedBefore = 0;
        uint256 nodeBond = _megapool.getNodeBond();
        uint256 effectiveBond = nodeBond + _megapool.getNodeQueuedBond();
        if (outstandingExitCount > 0) {
            uint256 previousRequirement = rocketNodeDeposit.getBondRequirement(activeValidatorCount - outstandingExitCount);
            releasedBefore = _calculateReleasedNodeBond(effectiveBond, nodeBond, previousRequirement, outstandingExitCount);
        }
        uint256 newOutstandingExitCount = outstandingExitCount + 1;
        uint256 newRequirement = rocketNodeDeposit.getBondRequirement(activeValidatorCount - newOutstandingExitCount);
        uint256 releasedAfter = _calculateReleasedNodeBond(effectiveBond, nodeBond, newRequirement, newOutstandingExitCount);
        uint256 marginalBond = releasedAfter - releasedBefore;
        return validatorDeposit - marginalBond;
    }

    function _calculateReleasedNodeBond(uint256 _effectiveBond, uint256 _nodeBond, uint256 _bondRequirement, uint256 _exitCount) internal pure returns (uint256) {
        if (_effectiveBond <= _bondRequirement) {
            return 0;
        }
        uint256 released = _effectiveBond - _bondRequirement;
        uint256 validatorLimit = validatorDeposit * _exitCount;
        if (released > validatorLimit) {
            released = validatorLimit;
        }
        if (released > _nodeBond) {
            released = _nodeBond;
        }
        return released;
    }

    /// @dev Returns the "cooperative exit" deadline a NO has to exit on their own before being forced
    function _getCooperativeExitPhase() internal view returns (uint256) {
        return _getNetworkSettings().getCooperativeExitPhase();
    }

    /// @dev Returns the base penalty in ETH for not exiting when requested
    function _getDidNotExitPenaltyBase() internal view returns (uint256) {
        return _getNetworkSettings().getDidNotExitPenaltyBase();
    }

    /// @dev Returns the base delay before a Minipool can be requested to exit again
    function _getDidNotExitBase() internal view returns (uint256) {
        return _getNetworkSettings().getDidNotExitBase();
    }

    /// @dev Returns the backoff multiplier applied after each failed exit
    function _getDidNotExitBackoff() internal view returns (uint256) {
        return _getNetworkSettings().getDidNotExitBackoff();
    }

    function _getNetworkSettings() internal view returns (RocketDAOProtocolSettingsNetworkInterface) {
        return RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
    }

    /// @dev Executes one EIP-7002 request per validator and refunds any unused caller-supplied fee
    function _forceMegapoolValidators(RocketMegapoolInterface _megapool, uint32[] memory _validatorIds) internal {
        uint256 fee = getExitFee();
        uint256 requiredFee = fee * _validatorIds.length;
        require(msg.value >= requiredFee, "Insufficient exit fee");

        for (uint256 i = 0; i < _validatorIds.length; ++i) {
            _megapool.forceExit{value: fee}(_validatorIds[i]);
        }

        _refundExcessExitFee(requiredFee);
    }

    /// @dev Refunds caller-supplied ETH that was not used for EIP-7002 requests
    function _refundExcessExitFee(uint256 _usedFee) internal {
        uint256 refund = msg.value - _usedFee;
        if (refund > 0) {
            (bool success,) = payable(msg.sender).call{value: refund}("");
            require(success, "Exit fee refund failed");
        }
    }

    /// @dev Reverts if Minipool has not been requested to exit or the cooperative exit phase has not been waited
    function _validateMinipoolCooperativeExit(address _minipoolAddress, uint256 _timestamp) internal {
        uint256 requestTime = getMinipoolCooperativeExitStart(_minipoolAddress);
        require(requestTime != 0, "Force exit has not been requested");
        require(requestTime <= _timestamp - _getCooperativeExitPhase(), "Not enough time has passed");
    }

    /// @dev Reverts if Megapool validator has not been requested to exit or the cooperative exit phase has not been waited
    function _validateMegapoolCooperativeExit(address _megapoolAddress, uint32 _validatorId) internal {
        uint256 requestTime = getMegapoolCooperativeExitStart(_megapoolAddress, _validatorId);
        require(requestTime != 0, "Force exit has not been requested");
        require(requestTime <= block.timestamp - _getCooperativeExitPhase(), "Not enough time has passed");
    }

    /// @dev Increases the penalty rate on a Minipool by the "did not exit penalty"
    /// @param _minipoolAddress Address of the Minipool to penalise
    function _applyMinipoolPenalty(address _minipoolAddress) internal {
        // Exit policy determines the nominal amount; NetworkPenalties owns conversion and combined rate accounting
        uint256 requestCount = getMinipoolExitRequestCount(_minipoolAddress);
        require(requestCount > 0, "Minipool has not been requested to exit");
        uint256 penaltyAmount = _applyBackoff(_getDidNotExitPenaltyBase(), requestCount - 1);
        RocketNetworkPenaltiesInterface(getContractAddress("rocketNetworkPenalties")).applyExitPenalty(_minipoolAddress, penaltyAmount);
        // Emit event
        emit MinipoolPenalised(_minipoolAddress, penaltyAmount);
    }

    /// @dev Applies the configured fixed-point backoff to a base value
    function _applyBackoff(uint256 _base, uint256 _exponent) internal view returns (uint256) {
        uint256 result = calcBase;
        uint256 multiplier = _getDidNotExitBackoff();
        while (_exponent > 0) {
            if ((_exponent & 1) == 1) {
                result = Math.mulDiv(result, multiplier, calcBase);
            }
            _exponent >>= 1;
            if (_exponent > 0) {
                multiplier = Math.mulDiv(multiplier, multiplier, calcBase);
            }
        }
        return Math.mulDiv(_base, result, calcBase);
    }

    // Key builders

    function minipoolExpectedUserCapitalKey(address _minipoolAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.requested.eth.minipool", _minipoolAddress));
    }

    function minipoolForceExitSubmittedKey(address _minipoolAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.request.minipool.force.submitted", _minipoolAddress));
    }

    function megapoolExitTypeKey(address _megapoolAddress, uint32 _validatorId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.megapool.type", _megapoolAddress, _validatorId));
    }

    function megapoolExpectedUserCapitalKey(address _megapoolAddress, uint32 _validatorId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.megapool.expected.user.capital", _megapoolAddress, _validatorId));
    }

    function megapoolOutstandingExitCountKey(address _megapoolAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("exit.megapool.outstanding.count", _megapoolAddress));
    }
}
