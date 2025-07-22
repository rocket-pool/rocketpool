// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {DepositInterface} from "../../interface/casper/DepositInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateBase} from "./RocketMegapoolDelegateBase.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {RocketRewardsPoolInterface} from "../../interface/rewards/RocketRewardsPoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketTokenRETHInterface} from "../../interface/token/RocketTokenRETHInterface.sol";

/// @notice This contract manages multiple validators belonging to an individual node operator.
///         It serves as the withdrawal credentials for all Beacon Chain validators managed by it.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;
    uint256 constant internal milliToWei = 10 ** 15;
    uint256 constant internal calcBase = 1 ether;
    uint256 constant internal secondsPerSlot = 12;
    uint256 constant internal slotsPerEpoch = 32;

    // Events
    event MegapoolValidatorEnqueued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorAssigned(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorExited(uint32 indexed validatorId, uint256 time);
    event MegapoolValidatorExiting(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorLocked(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorUnlocked(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDissolved(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorStaked(uint256 indexed validatorId, uint256 time);
    event MegapoolPenaltyApplied(uint256 amount, uint256 time);
    event MegapoolDebtIncreased(uint256 amount, uint256 time);
    event MegapoolDebtReduced(uint256 amount, uint256 time);
    event MegapoolBondReduced(uint256 amount, uint256 time);
    event RewardsDistributed(uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount, uint256 time);
    event RewardsClaimed(uint256 amount, uint256 time);

    // Immutables
    bytes32 immutable internal rocketDepositPoolKey;
    bytes32 immutable internal rocketMegapoolManagerKey;
    bytes32 immutable internal rocketNodeDepositKey;
    address payable immutable internal rocketTokenRETH;
    DepositInterface immutable internal casperDeposit;
    uint256 immutable internal genesisTime;

    modifier onlyRocketMegapoolManager() {
        require(msg.sender == rocketStorage.getAddress(rocketMegapoolManagerKey), "Invalid or outdated contract");
        _;
    }

    modifier onlyRocketNodeDeposit() {
        require(msg.sender == rocketStorage.getAddress(rocketNodeDepositKey), "Invalid or outdated contract");
        _;
    }

    /// @notice Constructor
    /// @param _rocketStorageAddress Address of the deployments RocketStorage
    /// @param _beaconGenesisTime Chain specific genesis time for calculating current slots and epochs
    constructor(RocketStorageInterface _rocketStorageAddress, uint256 _beaconGenesisTime) RocketMegapoolDelegateBase(_rocketStorageAddress, 1) {
        // Precompute static storage keys
        rocketDepositPoolKey = keccak256(abi.encodePacked("contract.address", "rocketDepositPool"));
        rocketMegapoolManagerKey = keccak256(abi.encodePacked("contract.address", "rocketMegapoolManager"));
        rocketNodeDepositKey = keccak256(abi.encodePacked("contract.address", "rocketNodeDeposit"));
        // Prefetch immutable contracts
        rocketTokenRETH = payable(getContractAddress("rocketTokenRETH"));
        casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // Set other immutables
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

    /// @notice Returns the number of validators locked by a exit challenge
    function getLockedValidatorCount() external view returns (uint32) {
        return numLockedValidators;
    }

    /// @notice Returns the soonest epoch a validator within this megapool can be withdrawn
    function getSoonestWithdrawableEpoch() external view returns (uint64) {
        return soonestWithdrawableEpoch;
    }

    /// @notice Returns information about a given validator
    function getValidatorInfo(uint32 _validatorId) override external view returns (ValidatorInfo memory) {
        return validators[_validatorId];
    }

    /// @notice Returns information about a given validator
    function getValidatorPubkey(uint32 _validatorId) override external view returns (bytes memory) {
        return pubkeys[_validatorId];
    }

    /// @notice Returns both validator information and pubkey
    /// @param _validatorId Internal ID of the validator to query
    function getValidatorInfoAndPubkey(uint32 _validatorId) override external view returns (ValidatorInfo memory info, bytes memory pubkey) {
        info = validators[_validatorId];
        pubkey = pubkeys[_validatorId];
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

    /// @notice Creates a new validator for this megapool
    /// @param _bondAmount The bond amount supplied by the node operator
    /// @param _useExpressTicket If an express ticket should be used
    /// @param _validatorPubkey The pubkey of the new validator
    /// @param _validatorSignature A signature over the deposit data root
    /// @param _depositDataRoot Merkle root of the deposit data
    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyRocketNodeDeposit {
        // Check bond and debt requirements
        {
            RocketNodeDepositInterface rocketNodeDeposit = getRocketNodeDeposit();
            uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount() + 1);
            if (newBondRequirement > nodeBond) {
                require(_bondAmount + nodeBond == newBondRequirement, "Bond requirement not met");
            }
            require(debt == 0, "Cannot create validator while debt exists");
        }
        // Setup new validator
        RocketDepositPoolInterface rocketDepositPool = getRocketDepositPool();
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
            validators[validatorId] = validator;
        }
        // Store prestake data and pubkey
        prestakeSignatures[validatorId] = _validatorSignature;
        pubkeys[validatorId] = _validatorPubkey;
        // Compute and verify supplied deposit data root is correct
        // Note: We check this here to ensure the deposit contract will not revert when executing prestake
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
        RocketDepositPoolInterface rocketDepositPool = getRocketDepositPool();
        rocketDepositPool.exitQueue(nodeAddress, _validatorId, validator.expressUsed);
        rocketDepositPool.fundsReturned(nodeAddress, nodeShare, userShare);
        if (nodeShare > 0) {
            nodeBond -= nodeShare;
            rocketDepositPool.applyCredit(nodeAddress, nodeShare);
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
        RocketNodeDepositInterface rocketNodeDeposit = getRocketNodeDeposit();
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount());
        require(nodeBond > newBondRequirement, "Bond is at minimum");
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
        RocketDepositPoolInterface rocketDepositPool = getRocketDepositPool();
        rocketDepositPool.applyCredit(nodeAddress, _amount);
        rocketDepositPool.reduceBond(nodeAddress, _amount);
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
        bytes memory signature = prestakeSignatures[_validatorId];
        bytes memory pubkey = pubkeys[_validatorId];
        bytes32 depositDataRoot = computeDepositDataRoot(pubkey, signature, uint64(prestakeValue / 1 gwei));
        casperDeposit.deposit{value: prestakeValue}(pubkey, abi.encodePacked(getWithdrawalCredentials()), signature, depositDataRoot);
        // Delete prestake signature for a small gas refund (no longer needed)
        delete prestakeSignatures[_validatorId];
        // Emit event
        emit MegapoolValidatorAssigned(_validatorId, block.timestamp);
    }

    /// @notice Performs the remaining ETH deposit on the Beacon Chain
    /// @param _validatorId The internal ID of the validator in this megapool
    /// @param _validatorIndex The validator's index on the beacon chain
    function stake(uint32 _validatorId, uint64 _validatorIndex) external onlyRocketMegapoolManager {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.inPrestake, "Validator must be pre-staked");
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
        validator.validatorIndex = _validatorIndex;
        validator.depositValue += uint32(lastRequestedValue - prestakeValue / milliToWei);
        validators[_validatorId] = validator;
        // Perform remaining 31 ETH stake onto beaconchain
        // Note: Signature is not verified on subsequent deposits and we know the validator is valid due to state proof
        bytes memory signature = hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        bytes memory pubkey = pubkeys[_validatorId];
        bytes32 depositDataRoot = computeDepositDataRoot(pubkey, signature, uint64(assignedUsed / 1 gwei));
        casperDeposit.deposit{value: assignedUsed}(pubkey, abi.encodePacked(getWithdrawalCredentials()), signature, depositDataRoot);
        // Emit event
        emit MegapoolValidatorStaked(_validatorId, block.timestamp);
    }

    /// @notice Dissolves a validator that has not staked within the required period
    /// @param _validatorId the validator ID to dissolve
    /// @dev "Time before dissolve" parameter must be respected if not called from RocketMegapoolManager
    function dissolveValidator(uint32 _validatorId) override external {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Check current status
        require(validator.inPrestake, "Validator not prestaked");
        // Ensure scrub period has passed before allowing dissolution
        if (msg.sender != rocketStorage.getAddress(rocketMegapoolManagerKey)) {
            RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
            uint256 timeBeforeDissolve = rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve();
            require(block.timestamp > validator.lastAssignmentTime + timeBeforeDissolve, "Not enough time has passed");
        }
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
            RocketDepositPoolInterface rocketDepositPool = getRocketDepositPool();
            rocketDepositPool.recycleDissolvedDeposit{value: userShare}();
            rocketDepositPool.fundsReturned(nodeAddress, nodeShare, userShare);
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

    /// @dev Internal implementation of the repay debt function
    /// @param _amount Amount of debt to repay
    function _repayDebt(uint256 _amount) internal {
        require(debt >= _amount, "Not enough debt");
        sendToRETH(_amount);
        _reduceDebt(_amount);
    }

    /// @notice Distributes any accrued staking rewards
    function distribute() override public {
        // Calculate split of rewards
        uint256 rewards = getPendingRewards();
        if (rewards == 0) {
            return;
        }
        _distributeAmount(rewards);
        // If owner is calling, claim immediately
        if (isNodeCalling(msg.sender)) {
            _claim();
        }
    }

    /// @dev Internal implementation of distribute process
    /// @param _rewards Amount of rewards to distribute
    function _distributeAmount(uint256 _rewards) internal {
        // Cannot distribute a megapool with exiting validators
        if (numExitingValidators > 0) {
            uint256 currentEpoch = getCurrentEpoch();
            if (currentEpoch >= soonestWithdrawableEpoch) {
                revert("Pending validator exit");
            }
        }
        // Cannot distribute if challenged by oDAO
        require(numLockedValidators == 0, "Megapool locked");
        (uint256 nodeAmount, uint256 voterAmount, uint256 protocolDAOAmount, uint256 rethAmount) = calculateRewards(_rewards);
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
        // Send voter share to rewards pool
        if (voterAmount > 0) {
            RocketRewardsPoolInterface rocketRewardsPool = RocketRewardsPoolInterface(getContractAddress("rocketRewardsPool"));
            rocketRewardsPool.depositVoterShare{value: voterAmount}();
        }
        // Protocol DAO share to rocketClaimDAO
        if (protocolDAOAmount > 0) {
            address rocketClaimDAO = getContractAddress("rocketClaimDAO");
            (bool success,) = rocketClaimDAO.call{value: protocolDAOAmount}("");
            require(success, "Failed to send protocol DAO rewards");
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
        // If node operator has a debt, pay that off first
        if (debt > 0) {
            if (debt > amountToSend) {
                _repayDebt(amountToSend);
                amountToSend = 0;
            } else {
                amountToSend -= debt;
                _repayDebt(debt);
            }
        }
        // Zero out refund value
        refundValue = 0;
        // If there is still an amount to send after debt, do so now
        if (amountToSend > 0) {
            address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
            (bool success,) = nodeWithdrawalAddress.call{value: amountToSend}("");
            require(success, "Failed to send ETH");
        }
        // Emit event
        emit RewardsClaimed(amountToSend, block.timestamp);
    }

    /// @notice Returns the calculated split of pending rewards
    function calculatePendingRewards() override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards) {
        return calculateRewards(getPendingRewards());
    }

    /// @notice Calculates the split of rewards for a given amount of ETH
    /// @param _amount Amount of rewards in gwei to calculate the split of
    function calculateRewards(uint256 _amount) public view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards) {
        // Early out for edge cases
        if (_amount == 0) return (0, 0, 0, 0);
        uint256 totalCapital = nodeBond + userCapital;
        if (totalCapital == 0) return (_amount, 0, 0, 0);
        // Calculate split based on capital ratio and average commission since last distribute
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        (, uint256 voterShare, uint256 protocolDAOShare, uint256 rethShare) = rocketNetworkRevenues.calculateSplit(lastDistributionBlock);
        unchecked {
            uint256 borrowedPortion = _amount * userCapital / (nodeBond + userCapital);
            rethRewards = rethShare * borrowedPortion / calcBase;
            voterRewards = voterShare * borrowedPortion / calcBase;
            protocolDAORewards = protocolDAOShare * borrowedPortion / calcBase;
            nodeRewards = _amount - rethRewards - voterRewards - protocolDAORewards;
        }
    }

    /// @notice Used to optimistically lock a megapool with an oDAO challenging that a validator has exited
    /// @param _validatorId Internal ID of the validator to lock
    function challengeExit(uint32 _validatorId) override external onlyRocketMegapoolManager {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(validator.staked, "Validator not staked");
        require(!validator.exiting, "Already exiting");
        require(!validator.exited, "Already exited");
        // Only the first challenge increments the lock counter, subsequent challenges only update the lockedSlot
        if (!validator.locked) {
            validator.locked = true;
            unchecked { // Infeasible overflow
                numLockedValidators += 1;
            }
        }
        // Update locked slot to current slot
        validator.lockedSlot = getCurrentSlot();
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorLocked(_validatorId, block.timestamp);
    }

    /// @notice Unlocks a challenged validator
    /// @param _validatorId Internal ID of the validator to lock
    /// @param _slot The slot at which it was proved the validator is not exiting
    function notifyNotExit(uint32 _validatorId, uint64 _slot) override external onlyRocketMegapoolManager {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(validator.locked, "Validator not locked");
        require(_slot >= validator.lockedSlot, "Proof is older than challenge");
        // Update validator state to exiting/locked
        validator.locked = false;
        // Decrement locked validator counter
        numLockedValidators -= 1;
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorUnlocked(_validatorId, block.timestamp);
    }

    /// @notice Used to notify the megapool that one of its validators is exiting the beaconchain
    /// @param _validatorId Internal ID of the validator to notify exit for
    /// @param _withdrawableEpoch The proven withdrawable_epoch value for the validator
    function notifyExit(uint32 _validatorId, uint64 _withdrawableEpoch) override external onlyRocketMegapoolManager {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(validator.staked || validator.dissolved, "Not staking or dissolved");
        require(!validator.exiting, "Already notified");
        require(!validator.exited, "Already exited");
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
        // If validator was locked, notifying exit unlocks it
        if (validator.locked) {
            validator.locked = false;
            numLockedValidators -= 1;
        }
        validators[_validatorId] = validator;
        // Apply penalty for late submission
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 notifyThreshold = rocketDAOProtocolSettingsMegapool.getNotifyThreshold();
        uint256 withdrawableTime = genesisTime + (_withdrawableEpoch * secondsPerSlot * slotsPerEpoch);
        if (block.timestamp + notifyThreshold > withdrawableTime) {
            _increaseDebt(rocketDAOProtocolSettingsMegapool.getLateNotifyFine());
        }
        // Emit event
        emit MegapoolValidatorExiting(_validatorId, block.timestamp);
    }

    /// @notice Used to notify the megapool of the final balance of an exited validator
    /// @param _validatorId Internal ID of the validator to notify final balance of
    /// @param _amountInGwei The amount in the final withdrawal
    /// @param _caller The address which is submitted the final balance (i.e. msg.sender passed from RocketMegapoolManager)
    /// @param _withdrawalSlot The slot containing the withdrawal
    function notifyFinalBalance(uint32 _validatorId, uint64 _amountInGwei, address _caller, uint64 _withdrawalSlot) override external onlyRocketMegapoolManager {
        // Perform notification process
        _notifyFinalBalance(_validatorId, _amountInGwei, _withdrawalSlot);
        // Trigger a deposit of excess collateral from rETH contract to deposit pool
        RocketTokenRETHInterface(rocketTokenRETH).depositExcessCollateral();
        // If owner is calling, claim immediately
        if (isNodeCalling(_caller)) {
            _claim();
        } else {
            // Permissionless distribute requires a wait time
            RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
            uint256 distributeWindowStart = rocketDAOProtocolSettingsMegapool.getUserDistributeWindowLength();
            uint256 withdrawableEpoch = uint256(validators[_validatorId].withdrawableEpoch);
            uint256 distributableTime = (withdrawableEpoch * secondsPerSlot * slotsPerEpoch + genesisTime) + distributeWindowStart;
            require(block.timestamp > distributableTime, "Not enough time has passed");
        }
    }

    /// @dev Internal implementation of final balance notification process
    /// @param _validatorId Internal ID of the validator to notify final balance of
    /// @param _amountInGwei The amount in the final withdrawal
    /// @param _withdrawalSlot The slot containing the withdrawal
    function _notifyFinalBalance(uint32 _validatorId, uint64 _amountInGwei, uint64 _withdrawalSlot) internal {
        ValidatorInfo memory validator = validators[_validatorId];
        require(!validator.exited, "Already exited");
        require(validator.exiting, "Validator not exiting");
        require(_withdrawalSlot >= validator.withdrawableEpoch * slotsPerEpoch, "Not full withdrawal");
        // Mark as exited
        validator.exited = true;
        validator.exiting = false;
        validator.exitBalance = uint64(_amountInGwei);
        uint256 withdrawalBalance = uint256(_amountInGwei) * 1 gwei;
        validators[_validatorId] = validator;
        // Handle dissolved recovery
        if (validator.dissolved) {
            // Send full withdrawal balance to NO
            refundValue += withdrawalBalance;
        } else {
            // Calculate capital distribution amounts
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
                // Pay off any existing debt and any new debt introduced by this exit
                if (toUser < userShare) {
                    _increaseDebt(userShare - toUser);
                }
                if (toNode > 0 && debt > 0) {
                    if (toNode > debt) {
                        toNode -= debt;
                        toUser += debt;
                        _reduceDebt(debt);
                    } else {
                        toUser += toNode;
                        _reduceDebt(toNode);
                        toNode = 0;
                    }
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
            unchecked { // Infeasible overflow
                numInactiveValidators += 1;
            }
            // Handle collateral change
            RocketDepositPoolInterface rocketDepositPool = getRocketDepositPool();
            rocketDepositPool.fundsReturned(nodeAddress, nodeShare, userShare);
        }
        // Remove distribution lock
        numExitingValidators -= 1;
        if (numExitingValidators == 0) {
            soonestWithdrawableEpoch = 0;
        }
        // Emit event
        emit MegapoolValidatorExited(_validatorId, block.timestamp);
    }

    /// @notice Applies a penalty via increase debt (only callable from rocketMegapoolPenalties)
    /// @param _amount Amount of the penalty
    function applyPenalty(uint256 _amount) override external onlyLatestContract("rocketMegapoolPenalties", msg.sender) {
        _increaseDebt(_amount);
        emit MegapoolPenaltyApplied(_amount, block.timestamp);
    }

    /// @dev Increases debt of this megapool
    function _increaseDebt(uint256 _amount) internal {
        debt += _amount;
        emit MegapoolDebtIncreased(_amount, block.timestamp);
    }

    /// @dev Reduces debt of this megapool
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

    /// @dev Calculates the current slot on the beacon chain
    function getCurrentSlot() internal view returns (uint64) {
        unchecked {
            uint256 currentTime = block.timestamp;
            return uint64((currentTime - genesisTime) / secondsPerSlot);
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
    /// @param _value The amount of ETH capital that is needing to be dispersed
    /// @param _newValidatorCount The number of validators the node will have after this dispersal
    function calculateCapitalDispersal(uint256 _value, uint256 _newValidatorCount) internal view returns (uint256 _nodeShare, uint256 _userShare) {
        RocketNodeDepositInterface rocketNodeDeposit = getRocketNodeDeposit();
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

    /// @dev Convenience function to return interface to RocketDepositPool
    function getRocketDepositPool() internal view returns (RocketDepositPoolInterface) {
        return RocketDepositPoolInterface(rocketStorage.getAddress(rocketDepositPoolKey));
    }

    /// @dev Convenience function to return interface to RocketNodeDeposit
    function getRocketNodeDeposit() internal view returns (RocketNodeDepositInterface) {
        return RocketNodeDepositInterface(rocketStorage.getAddress(rocketNodeDepositKey));
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