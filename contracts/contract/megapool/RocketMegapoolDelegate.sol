// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {DepositInterface} from "../../interface/casper/DepositInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {ValidatorProof, BeaconStateVerifierInterface, Withdrawal} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {RocketMegapoolDelegateBase} from "./RocketMegapoolDelegateBase.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";

/// @notice This contract manages multiple validators. It serves as the target of Beacon Chain withdrawal credentials.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;
    uint256 constant internal milliToWei = 10 ** 15;
    uint256 constant internal calcBase = 1 ether;
    uint256 constant internal farFutureEpoch = 2 ** 64 - 1;
    uint256 constant internal secondsPerSlot = 12;
    uint256 constant internal slotsPerEpoch = 32;

    // Events
    event MegapoolValidatorEnqueued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorAssigned(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorExited(uint32 indexed validatorId, uint256 time);
    event MegapoolValidatorExiting(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDissolved(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorStaked(uint256 indexed validatorId, uint256 time);
    event MegapoolPenaltyApplied(uint256 amount, uint256 time);
    event MegapoolDebtIncreased(uint256 amount, uint256 time);
    event MegapoolDebtReduced(uint256 amount, uint256 time);
    event MegapoolBondReduced(uint256 amount, uint256 time);
    event RewardsDistributed(uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount, uint256 time);
    event RewardsClaimed(uint256 amount, uint256 time);

    // Immutables
    bytes32 immutable internal rocketTokenRPLKey;
    bytes32 immutable internal rocketVaultKey;
    address payable immutable internal rocketTokenRETH;
    uint256 immutable internal genesisTime;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, uint256 _beaconGenesisTime) RocketMegapoolDelegateBase(_rocketStorageAddress, 1) {
        // Precompute keys
        rocketVaultKey = keccak256(abi.encodePacked("contract.address", "rocketVault"));
        rocketTokenRPLKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRPL"));
        rocketTokenRETH = payable(getContractAddress("rocketTokenRETH"));
        genesisTime = _beaconGenesisTime;
    }

    /// @notice Gets the Node address associated to this megapool
    function getNodeAddress() public override view returns (address) {
        return nodeAddress;
    }

    /// @notice Returns the number of validators created for this megapool
    function getValidatorCount() override external view returns (uint32) {
        return numValidators;
    }

    /// @notice Returns the number of validators that are considered for bond requirement
    function getActiveValidatorCount() override public view returns (uint32) {
        return numValidators - numInactiveValidators;
    }

    /// @notice Returns the number of validators currently exiting
    function getExitingValidatorCount() external view returns (uint32) {
        return numExitingValidators;
    }

    /// @notice Returns the soonest epoch a validator within this megapool can be withdrawn
    function getSoonestWithdrawableEpoch() external view returns (uint64) {
        return soonestWithdrawableEpoch;
    }

    /// @notice Returns information about a given validator
    function getValidatorInfo(uint32 _validatorId) override external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory) {
        return validators[_validatorId];
    }

    /// @notice Returns the amount of ETH temporarily held in this contract from the protocol ready to be staked
    function getAssignedValue() override external view returns (uint256) {
        return assignedValue;
    }

    /// @notice Returns the amount of ETH the node operator owes the protocol
    function getDebt() override external view returns (uint256) {
        return debt;
    }

    /// @notice Returns the amount of ETH available to refund to the node operator
    function getRefundValue() override external view returns (uint256) {
        return refundValue;
    }

    /// @notice Returns the amount of ETH supplied by the node operator (Bonded ETH)
    function getNodeBond() override external view returns (uint256) {
        return nodeBond;
    }

    /// @notice Returns the amount of ETH capital provided by the protocol (Borrowed ETH)
    function getUserCapital() override external view returns (uint256) {
        return userCapital;
    }

    /// @notice Returns the amount in wei of pending rewards ready to be distributed
    function getPendingRewards() override public view returns (uint256) {
        return
            address(this).balance
            - refundValue
            - assignedValue;
    }

    /// @notice Returns the block number of the last distribution performed
    function getLastDistributionBlock() override external view returns (uint256) {
        return lastDistributionBlock;
    }

    /// @notice Returns the expected withdrawal credentials for any validator within this megapool
    function getWithdrawalCredentials() override public view returns (bytes32) {
        return bytes32((uint256(0x01) << 248) | uint256(uint160(address(this))));
    }

    /// @notice Creates a new validator as part of a megapool
    /// @param _useExpressTicket If an express ticket should be used
    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Check bond and debt requirements
        {
            RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
            uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount() + 1);
            if (newBondRequirement > nodeBond) {
                unchecked { // newBondRequirement > nodeBond
                    require(_bondAmount == newBondRequirement - nodeBond, "Bond requirement not met");
                }
            }
            require(debt == 0, "Cannot create validator while debt exists");
        }
        // Setup new validator
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint32 validatorId = uint32(numValidators);
        unchecked { // Infeasible overflow
            numValidators += 1;
        }
        {
            ValidatorInfo memory validator;
            validator.inQueue = true;
            validator.lastRequestedBond = uint32(_bondAmount / milliToWei);
            validator.lastRequestedValue = uint32(fullDepositValue / milliToWei);
            validator.expressUsed = _useExpressTicket;
            validator.pubKey = _validatorPubkey;
            validators[validatorId] = validator;
        }
        // Store prestake data
        {
            PrestakeData memory prestake;
            prestake._signature = _validatorSignature;
            prestakeData[validatorId] = prestake;
        }
        // Compute and verify supplied deposit data root is correct
        bytes32 depositDataRoot = computeDepositDataRoot(_validatorPubkey, _validatorSignature, uint64(prestakeValue / 1 gwei));
        require(depositDataRoot == _depositDataRoot, "Invalid deposit data root");
        // Increase total bond used for bond requirement calculations
        nodeBond += _bondAmount;
        userCapital += fullDepositValue - _bondAmount;
        // Request full deposit amount from deposit pool
        rocketDepositPool.requestFunds(_bondAmount, validatorId, fullDepositValue, _useExpressTicket);
        // Emit event
        emit MegapoolValidatorEnqueued(validatorId, block.timestamp);
    }

    /// @notice Removes a validator from the deposit queue
    /// @param _validatorId the validator ID
    function dequeue(uint32 _validatorId) external onlyMegapoolOwner {
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.inQueue, "Validator must be in queue");
        // Decrease total bond used for bond requirement calculations
        uint256 requestedValue = uint256(validator.lastRequestedValue) * milliToWei;
        (uint256 nodeShare, uint256 userShare) = calculateCapitalDispersal(requestedValue, getActiveValidatorCount() - 1);
        userCapital -= userShare;
        // Dequeue validator from the deposit pool and issue credit
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(_validatorId, validator.expressUsed);
        rocketDepositPool.fundsReturned(nodeShare, userShare);
        if (nodeShare > 0) {
            nodeBond -= nodeShare;
            rocketDepositPool.applyCredit(nodeShare);
        }
        // Increment inactive validator count
        unchecked { // Infeasible overflow
            numInactiveValidators += 1;
        }
        // Update validator state
        validator.inQueue = false;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorDequeued(_validatorId, block.timestamp);
    }

    /// @notice Reduces this megapool's bond and applies credit if current bond exceeds requirement
    /// @param _amount Amount in ETH to reduce bond by
    function reduceBond(uint256 _amount) override external onlyMegapoolOwner {
        // Check pre-conditions
        require(_amount > 0, "Invalid amount");
        require(debt == 0, "Cannot reduce bond with debt");
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount());
        require (nodeBond > newBondRequirement, "Bond is at minimum");
        uint256 maxReduce = nodeBond - newBondRequirement;
        require(_amount <= maxReduce, "New bond is too low");
        // Force distribute at previous capital ratio
        uint256 pendingRewards = getPendingRewards();
        if (pendingRewards > 0) {
            _distributeAmount(pendingRewards);
        }
        // Reduce node bond
        nodeBond -= _amount;
        userCapital += _amount;
        // Apply credit
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.applyCredit(_amount);
        rocketDepositPool.reduceBond(_amount);
        // Emit event
        emit MegapoolBondReduced(_amount, block.timestamp);
    }

    /// @notice Accepts requested funds from the deposit pool
    /// @param _validatorId the validator ID
    function assignFunds(uint32 _validatorId) external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        // Fetch validator data from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Update validator status
        validator.inQueue = false;
        validator.inPrestake = true;
        validator.lastAssignmentTime = uint32(block.timestamp);
        // Record value assigned from deposit pool (subtract prestakeValue as it is going to deposit contract now)
        validator.depositValue += uint32(prestakeValue / milliToWei);
        assignedValue += msg.value - prestakeValue;
        validators[_validatorId] = validator;
        // Execute prestake operation
        PrestakeData memory validatorPrestakeData = prestakeData[_validatorId];
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        bytes32 depositDataRoot = computeDepositDataRoot(validator.pubKey, validatorPrestakeData._signature, uint64(prestakeValue / 1 gwei));
        casperDeposit.deposit{value: prestakeValue}(validator.pubKey, abi.encodePacked(getWithdrawalCredentials()), validatorPrestakeData._signature, depositDataRoot);
        // Clean up prestake data
        delete prestakeData[_validatorId];
        // Emit event
        emit MegapoolValidatorAssigned(_validatorId, block.timestamp);
    }

    /// @notice Performs the remaining ETH deposit on the Beacon Chain
    /// @param _validatorId The validator ID
    /// @param _proof A proof struct proving the withdrawal credentials of the validator
    function stake(uint32 _validatorId, ValidatorProof calldata _proof) external {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.inPrestake, "Validator must be pre-staked");
        // Verify proof data
        bytes32 withdrawalCredentials = getWithdrawalCredentials();
        require(_proof.withdrawalCredentials == withdrawalCredentials, "Invalid withdrawal credentials");
        require(keccak256(_proof.pubkey) == keccak256(validator.pubKey));
        // Store last requested value for later
        uint32 lastRequestedValue = validator.lastRequestedValue;
        // If this is the first validator, then set the last distribution block
        if (lastDistributionBlock == 0) {
            lastDistributionBlock = block.number;
        }
        // Account for assigned value
        uint256 assignedUsed = lastRequestedValue * milliToWei - prestakeValue;
        assignedValue -= assignedUsed;
        // Update validator status
        validator.staked = true;
        validator.inPrestake = false;
        validator.lastAssignmentTime = 0;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validator.validatorIndex = _proof.validatorIndex;
        validator.depositValue += uint32(lastRequestedValue - prestakeValue / milliToWei);
        validators[_validatorId] = validator;
        // Verify state proof to ensure validator has correct withdrawal credentials
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Perform remaining 31 ETH stake onto beaconchain
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        bytes memory signature = hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        bytes32 depositDataRoot = computeDepositDataRoot(validator.pubKey, signature, uint64(assignedUsed / 1 gwei));
        casperDeposit.deposit{value: assignedUsed}(validator.pubKey, abi.encodePacked(withdrawalCredentials), signature, depositDataRoot);
        // Emit event
        emit MegapoolValidatorStaked(_validatorId, block.timestamp);
    }

    /// @notice Dissolves a validator that has not staked within the required period
    /// @param _validatorId the validator ID to dissolve
    function dissolveValidator(uint32 _validatorId) override external {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Check current status
        require(validator.inPrestake, "Validator not prestaked");
        // Ensure scrub period has passed before allowing dissolution
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 timeBeforeDissolve = rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve();
        require(block.timestamp > validator.lastAssignmentTime + timeBeforeDissolve, "Not enough time has passed");
        // Update validator info
        validator.inPrestake = false;
        validator.dissolved = true;
        validators[_validatorId] = validator;
        // Decrease total bond used for bond requirement calculations
        uint256 recycleValue = uint256(validator.lastRequestedValue) * milliToWei;
        (uint256 nodeShare, uint256 userShare) = calculateCapitalDispersal(recycleValue, getActiveValidatorCount() - 1);
        nodeBond -= nodeShare;
        userCapital -= userShare;
        unchecked { // Infeasible overflow
            numInactiveValidators += 1;
        }
        // Recycle ETH
        assignedValue -= recycleValue - prestakeValue;
        if (userShare > 0) {
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
            rocketDepositPool.recycleDissolvedDeposit{value: userShare}();
            rocketDepositPool.fundsReturned(nodeShare, userShare);
        }
        refundValue += nodeShare - prestakeValue;
        // Emit event
        emit MegapoolValidatorDissolved(_validatorId, block.timestamp);
    }

    /// @notice Receives ETH, which is sent to the rETH contract, to repay a debt owed by the node operator
    function repayDebt() override external payable {
        require(msg.value > 0, "Invalid value received");
        _repayDebt(msg.value);
    }

    function _repayDebt(uint256 _amount) internal {
        require(debt >= _amount, "Not enough debt");
        sendToRETH(_amount);
        _reduceDebt(_amount);
    }

    /// @notice Distributes any accrued execution layer rewards sent to this address
    function distribute() override public {
        // Calculate split of rewards
        uint256 rewards = getPendingRewards();
        if (rewards == 0) {
            return;
        }
        _distributeAmount(rewards);
        // If owner is calling, claim immediately
        if (isNodeCalling()) {
            _claim();
        }
    }

    /// @dev Internal implementation of distribute process
    function _distributeAmount(uint256 _rewards) internal {
        // Cannot distribute a megapool with exiting validators
        if (numExitingValidators > 0) {
            uint256 currentEpoch = getCurrentEpoch();
            if (currentEpoch >= soonestWithdrawableEpoch) {
                revert("Pending validator exit");
            }
        }
        (uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount) = _calculateRewards(_rewards);
        // Update last distribution block for use in calculating time-weighted average commission
        lastDistributionBlock = block.number;
        // Maybe repay debt from node share
        if (debt > 0) {
            uint256 amountToRepay = nodeAmount;
            if (amountToRepay > debt) {
                amountToRepay = debt;
            }
            nodeAmount -= amountToRepay;
            _repayDebt(amountToRepay);
        }
        // Send user share to rETH
        sendToRETH(rethAmount);
        // Send voter share to voting contract
        if (voterAmount > 0) {
            // TODO: Potential oDAO attack here by making rocketVoterRewards revert on transfer
            address rocketVoterRewards = getContractAddress("rocketVoterRewards");
            (bool success,) = rocketVoterRewards.call{value: voterAmount}("");
            require(success, "Failed to send voter rewards");
        }
        // Increase node rewards value
        refundValue += nodeAmount;
        // Emit event
        emit RewardsDistributed(nodeAmount, voterAmount, rethAmount, block.timestamp);
    }

    /// @notice Claims any distributed but unclaimed rewards
    function claim() override public onlyMegapoolOwner() {
        _claim();
    }

    /// @dev Internal implementation of claim process
    function _claim() internal {
        uint256 amountToSend = refundValue;
        if (debt > 0) {
            if (debt > amountToSend) {
                _reduceDebt(amountToSend);
                refundValue = 0;
                return;
            } else {
                _reduceDebt(debt);
                amountToSend -= debt;
            }
        }
        // Zero out refund
        refundValue = 0;
        // Send to withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        (bool success,) = nodeWithdrawalAddress.call{value: amountToSend}("");
        require(success, "Failed to send ETH");
        // Emit event
        emit RewardsClaimed(amountToSend, block.timestamp);
    }

    /// @notice Returns the calculated split of pending rewards
    function calculatePendingRewards() override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        return _calculateRewards(getPendingRewards());
    }

    /// @notice Calculates the split of rewards for a given amount of ETH
    /// @param _amount Amount of rewards in gwei to calculate the split of
    function calculateRewards(uint256 _amount) override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        return _calculateRewards(_amount);
    }

    /// @dev Internal implementation of reward split calculation
    function _calculateRewards(uint256 _rewards) internal view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        (, uint256 voterShare, uint256 rethShare) = rocketNetworkRevenues.calculateSplit(lastDistributionBlock);
        unchecked {
            uint256 borrowedPortion = _rewards * userCapital / (nodeBond + userCapital);
            rethRewards = rethShare * borrowedPortion / calcBase;
            voterRewards = voterShare * borrowedPortion / calcBase;
            nodeRewards = _rewards - rethRewards - voterRewards;
        }
    }

    /// @notice Used to notify the megapool that one of its validators is exiting the beaconchain
    /// @param _validatorId Internal ID of the validator which is exiting
    /// @param _withdrawableEpoch The validator's `withdrawable_epoch` value
    /// @param _slot The slot for which the supplied proof was generated for
    /// @param _proof Merkle proof for the withdrawal_epoch value
    function notifyExit(uint32 _validatorId, uint64 _withdrawableEpoch, uint64 _slot, bytes32[] calldata _proof) override external {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(_withdrawableEpoch < farFutureEpoch, "Validator is not exiting");
        require(!validator.exiting, "Already notified");
        require(!validator.exited, "Already exited");
        require(!validator.dissolved, "Validator dissolved");
        // Map the internal ID to the beacon chain index used for the proof
        uint64 validatorIndex = validator.validatorIndex;
        // Verify the proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyExit(validatorIndex, _withdrawableEpoch, _slot, _proof), "Invalid proof");
        // Update validator state to exiting
        validator.exiting = true;
        validator.withdrawableEpoch = _withdrawableEpoch;
        // Setup distribution lock
        unchecked { // Infeasible overflow
            numExitingValidators += 1;
        }
        if (_withdrawableEpoch < soonestWithdrawableEpoch || soonestWithdrawableEpoch == 0) {
            soonestWithdrawableEpoch = _withdrawableEpoch;
        }
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorExiting(_validatorId, block.timestamp);
    }

    /// @notice Used to notify the megapool of the final balance of an exited validator
    /// @param _validatorId Internal ID of the exited validator
    /// @param _withdrawalSlot The slot which contains the execution payload with the withdrawal entry
    /// @param _withdrawalNum Index into withdrawal array for the relevant entry
    /// @param _withdrawal The withdrawal object from the beaconchain
    /// @param _slot The slot for which the supplied proof was generated for
    /// @param _proof Merkle proof of the withdraw object
    function notifyFinalBalance(uint32 _validatorId, uint64 _withdrawalSlot, uint256 _withdrawalNum, Withdrawal calldata _withdrawal, uint64 _slot, bytes32[] calldata _proof) override external {
        // Perform notification process
        _notifyFinalBalance(_validatorId, _withdrawalSlot, _withdrawalNum, _withdrawal, _slot, _proof);
        // If owner is calling, claim immediately
        if (isNodeCalling()) {
            _claim();
        } else {
            // Permissionless distribute requires a wait time
            RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
            uint256 distributeWindowStart = rocketDAOProtocolSettingsMinipool.getUserDistributeWindowStart();
            uint256 withdrawableEpoch = uint256(validators[_validatorId].withdrawableEpoch);
            uint256 distributableTime = (withdrawableEpoch * secondsPerSlot * slotsPerEpoch + genesisTime) + distributeWindowStart;
            require(block.timestamp > distributableTime, "Not enough time has passed");
        }
    }

    /// @dev Internal implementation of final balance notification process
    function _notifyFinalBalance(uint32 _validatorId, uint64 _withdrawalSlot, uint256 _withdrawalNum, Withdrawal calldata _withdrawal, uint64 _slot, bytes32[] calldata _proof) internal {
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        ValidatorInfo memory validator = validators[_validatorId];
        uint64 validatorIndex = validator.validatorIndex;
        // Verify proof
        require(_withdrawal.validatorIndex == validatorIndex, "Invalid validator index");
        require(beaconStateVerifier.verifyWithdrawal(validatorIndex, _withdrawalSlot, _withdrawalNum, _withdrawal, _slot, _proof), "Invalid proof");
        require(!validator.exited, "Already exited");
        require(validator.exiting, "Validator is not exiting");
        require(!validator.dissolved, "Validator dissolved");
        // Mark as exited
        validator.exited = true;
        validator.exiting = false;
        validator.exitBalance = uint64(_withdrawal.amountInGwei);
        uint256 withdrawalBalance = uint256(_withdrawal.amountInGwei) * 1 gwei;
        validators[_validatorId] = validator;
        // Handle dissolved recovery
        if (validator.dissolved) {
            // TODO: By using refundValue here on dissolve, NO will have debt applied to this value which might be undesirable
            // TODO: Instead, maybe only NO can notify final balance on a dissolved validator and the funds are immediately sent to their withdrawal address?
            refundValue += withdrawalBalance;
            return;
        }
        // Calculate capital distribution amounts
        // TODO: A malicious oDAO could prevent returning of funds by upgrading RocketNodeDeposit to a reverting contract
        uint256 depositBalance = uint256(validator.depositValue) * milliToWei;
        (uint256 nodeShare, uint256 userShare) = calculateCapitalDispersal(depositBalance, getActiveValidatorCount() - 1);
        {
            uint256 toNode = nodeShare;
            if (withdrawalBalance < depositBalance) {
                uint256 shortfall = depositBalance - withdrawalBalance;
                if (shortfall > toNode) {
                    toNode = 0;
                } else {
                    toNode -= shortfall;
                }
            }
            uint256 toUser = withdrawalBalance - toNode;
            if (toUser < userShare) {
                _increaseDebt(userShare - toUser);
            }
            // Send funds
            sendToRETH(toUser);
            if (toNode > 0) {
                refundValue += toNode;
            }
        }
        // Update state
        if (nodeShare > 0) {
            nodeBond -= nodeShare;
        }
        if (userShare > 0) {
            userCapital -= userShare;
        }
        numExitingValidators -= 1;
        unchecked { // Infeasible overflow
            numInactiveValidators += 1;
        }
        // Handle collateral change
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.fundsReturned(nodeShare, userShare);
        // Emit event
        emit MegapoolValidatorExited(_validatorId, block.timestamp);
    }

    /// @notice Applies a penalty via increase debt (only callable from rocketMegapoolPenalties)
    /// @param _amount Amount of the penalty
    function applyPenalty(uint256 _amount) override external onlyLatestContract("rocketMegapoolPenalties", msg.sender) {
        _increaseDebt(_amount);
        emit MegapoolPenaltyApplied(_amount, block.timestamp);
    }

    /// @dev Increases debt of this minipool
    function _increaseDebt(uint256 _amount) internal {
        debt += _amount;
        emit MegapoolDebtIncreased(_amount, block.timestamp);
    }

    /// @dev Reduces debt of this minipool
    function _reduceDebt(uint256 _amount) internal {
        debt -= _amount;
        emit MegapoolDebtReduced(_amount, block.timestamp);
    }

    /// @dev Calculates the current epoch on the beacon chain
    function getCurrentEpoch() internal view returns (uint256) {
        unchecked {
            uint256 currentTime = block.timestamp;
            uint256 slotsPassed = (currentTime - genesisTime) / secondsPerSlot;
            return slotsPassed / slotsPerEpoch;
        }
    }

    /// @dev Helper function to send an amount of ETH to the RETH token conract
    function sendToRETH(uint256 _amount) internal {
        if (_amount == 0) {
            return;
        }
        (bool success,) = rocketTokenRETH.call{value: _amount}("");
        require(success);
    }

    /// @dev Calculates share of returned capital based on current bond level and requirement
    function calculateCapitalDispersal(uint256 _value, uint256 _newValidatorCount) internal view returns (uint256 _nodeShare, uint256 _userShare) {
        // TODO: A malicious pDAO could prevent returning of funds by messing with these values
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(_newValidatorCount);
        _nodeShare = 0;
        if (newBondRequirement < nodeBond) {
            _nodeShare = nodeBond - newBondRequirement;
        }
        if (_nodeShare > _value) {
            _nodeShare = _value;
        }
        _userShare = _value - _nodeShare;
    }

    /// @dev Mirror deposit contract deposit data root calculation but with in-memory bytes instead of calldata
    function computeDepositDataRoot(bytes memory pubkey, bytes memory signature, uint64 amount) internal view returns (bytes32 ret) {
        bytes32 withdrawalCredentials = getWithdrawalCredentials();
        assembly {
            let result
            let temp := mload(0x40)

        // [0x00] = pubkey[0x00:0x20]
        // [0x20] = pubkey[0x20:0x30] . bytes16(0)
            mstore(0x00, mload(add(pubkey, 0x20)))
            mstore(0x20, and(mload(add(pubkey, 0x40)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000))

        // temp[0x00] = sha256([0x00:0x40])
            result := staticcall(84, 0x02, 0x00, 0x40, temp, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // temp[0x20] = withdrawal_credentials
            mstore(add(temp, 0x20), withdrawalCredentials)

        // temp[0x00] = sha256(temp[0x00:0x40])
            result := staticcall(84, 0x02, temp, 0x40, temp, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // temp[0x20] = sha256(signature[0x00:0x40])
            result := staticcall(84, 0x02, add(signature, 0x20), 0x40, add(temp, 0x20), 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // [0x00] = signature[0x40]
        // [0x20] = bytes32(0)
            mstore(0x00, mload(add(signature, 0x60)))
            mstore(0x20, 0)

        // [0x20] = sha256([0x00:0x40])
            result := staticcall(84, 0x02, 0x00, 0x40, 0x20, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // [0x00] = temp[0x20]
            mstore(0x00, mload(add(temp, 0x20)))

        // [0x20] = sha256([0x00:0x40])
            result := staticcall(84, 0x02, 0x00, 0x40, 0x20, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // [0x00] = to_little_endian(amount) . bytes24(0)
            mstore(0x00, 0)
            mstore8(0x00, shr(0x00, amount))
            mstore8(0x01, shr(0x08, amount))
            mstore8(0x02, shr(0x10, amount))
            mstore8(0x03, shr(0x18, amount))
            mstore8(0x04, shr(0x20, amount))
            mstore8(0x05, shr(0x28, amount))
            mstore8(0x06, shr(0x30, amount))
            mstore8(0x07, shr(0x38, amount))

        // [0x20] = sha256([0x00:0x40])
            result := staticcall(84, 0x02, 0x00, 0x40, 0x20, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // [0x00] = temp[0x00]
            mstore(0x00, mload(temp))

        // [0x00] = sha256([0x00:0x40])
            result := staticcall(84, 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

        // Return [0x00:0x20]
            ret := mload(0x00)
        }
    }
}