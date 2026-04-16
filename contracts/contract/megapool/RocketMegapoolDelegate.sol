// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {DepositInterface} from "../../interface/casper/DepositInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {RocketRewardsPoolInterface} from "../../interface/rewards/RocketRewardsPoolInterface.sol";
import {RocketTokenRETHInterface} from "../../interface/token/RocketTokenRETHInterface.sol";
import {RocketMegapoolDelegateBase} from "./RocketMegapoolDelegateBase.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {SafeCast} from "@openzeppelin4/contracts/utils/math/SafeCast.sol";

/// @notice This contract manages multiple validators belonging to an individual node operator.
///         It serves as the withdrawal credentials for all Beacon Chain validators managed by it.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;
    uint256 constant internal milliToWei = 10 ** 15;
    uint256 constant internal calcBase = 1 ether;

    // Events
    event MegapoolValidatorEnqueued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorAssigned(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorExited(uint32 indexed validatorId, uint256 time);
    event MegapoolValidatorExiting(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorForceExited(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorLocked(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorUnlocked(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDissolved(uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorStaked(uint256 indexed validatorId, uint256 time);
    event MegapoolPenaltyApplied(uint256 amount, uint256 time);
    event MegapoolDebtIncreased(uint256 amount, uint256 time);
    event MegapoolDebtReduced(uint256 amount, uint256 time);
    event MegapoolBondReduced(uint256 amount, uint256 time);
    event RewardsDistributed(uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount, uint256 protocolDaoAmount, uint256 time);
    event RewardsClaimed(uint256 amount, uint256 time);

    // Immutables
    bytes32 immutable internal rocketDepositPoolKey;
    bytes32 immutable internal rocketMegapoolManagerKey;
    bytes32 immutable internal rocketNodeDepositKey;
    address payable immutable internal rocketTokenRETH;
    DepositInterface immutable internal casperDeposit;
    address payable immutable internal withdrawalRequestPredeployAddress;

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
    constructor(RocketStorageInterface _rocketStorageAddress, address payable _withdrawalRequestPredeployAddress) RocketMegapoolDelegateBase(_rocketStorageAddress, 2) {
        // Precompute static storage keys
        rocketDepositPoolKey = keccak256(abi.encodePacked("contract.address", "rocketDepositPool"));
        rocketMegapoolManagerKey = keccak256(abi.encodePacked("contract.address", "rocketMegapoolManager"));
        rocketNodeDepositKey = keccak256(abi.encodePacked("contract.address", "rocketNodeDeposit"));
        // Prefetch immutable contracts
        rocketTokenRETH = payable(getContractAddress("rocketTokenRETH"));
        casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // Store EIP-7002 predeploy address
        withdrawalRequestPredeployAddress = _withdrawalRequestPredeployAddress;
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

    /// @notice Returns information about a given validator
    function getValidatorInfo(uint32 _validatorId) override external view returns (ValidatorInfo memory) {
        require(_validatorId < numValidators, "Validator does not exist");
        return validators[_validatorId];
    }

    /// @notice Returns pubkey for a given validator
    function getValidatorPubkey(uint32 _validatorId) override external view returns (bytes memory) {
        require(_validatorId < numValidators, "Validator does not exist");
        return pubkeys[_validatorId];
    }

    /// @notice Returns both validator information and pubkey
    /// @param _validatorId Internal ID of the validator to query
    function getValidatorInfoAndPubkey(uint32 _validatorId) override external view returns (ValidatorInfo memory info, bytes memory pubkey) {
        require(_validatorId < numValidators, "Validator does not exist");
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

    /// @notice Returns the amount of ETH bond provided by the node operator waiting in the queue for assignment
    function getNodeQueuedBond() override external view returns (uint256) {
        return nodeQueuedBond;
    }

    /// @notice Returns the amount of ETH capital provided by the protocol waiting in the queue for assignment
    function getUserQueuedCapital() override public view returns (uint256) {
        return userQueuedCapital;
    }

    /// @notice Returns the amount in wei of pending rewards ready to be distributed
    function getPendingRewards() override public view returns (uint256) {
        return
                address(this).balance
                - refundValue
                - assignedValue;
    }

    /// @notice Returns the block timestamp of the last distribution performed
    function getLastDistributionTime() override external view returns (uint256) {
        return lastDistributionTime;
    }

    /// @notice Returns the expected withdrawal credentials for any validator within this megapool
    function getWithdrawalCredentials() override public view returns (bytes32) {
        return bytes32((uint256(0x01) << 248) | uint256(uint160(address(this))));
    }

    /// @notice Returns the bond requirement for a new validator
    function getNewValidatorBondRequirement() override public view returns (uint256) {
        RocketNodeDepositInterface rocketNodeDeposit = _getRocketNodeDeposit();
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount() + 1);
        uint256 effectiveBond = nodeBond + nodeQueuedBond;
        if (newBondRequirement > effectiveBond) {
            // Clamp new bond requirement between 1 - 32 ETH
            if (newBondRequirement - effectiveBond < prestakeValue) {
                return prestakeValue;
            } else {
                uint256 bondRequirement = newBondRequirement - effectiveBond;
                if (bondRequirement > fullDepositValue) {
                    bondRequirement = fullDepositValue;
                }
                return bondRequirement;
            }
        } else {
            return prestakeValue;
        }
    }

    /// @notice Creates a new validator for this megapool
    /// @param _bondAmount The bond amount supplied by the node operator
    /// @param _useExpressTicket If an express ticket should be used
    /// @param _validatorPubkey The pubkey of the new validator
    /// @param _validatorSignature A signature over the deposit data root
    /// @param _depositDataRoot Merkle root of the deposit data
    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyRocketNodeDeposit {
        // Check bond and debt requirements
        require(_bondAmount == getNewValidatorBondRequirement(), "Bond requirement not met");
        require(debt == 0, "Cannot create validator while debt exists");
        // Setup new validator
        RocketDepositPoolInterface rocketDepositPool = _getRocketDepositPool();
        uint32 validatorId = numValidators;
        unchecked { // Infeasible overflow
            numValidators += 1;
        }
        {
            ValidatorInfo memory validator;
            validator.inQueue = true;
            validator.lastRequestedBond = SafeCast.toUint32(_bondAmount / milliToWei);
            validator.lastRequestedValue = SafeCast.toUint32(fullDepositValue / milliToWei);
            validator.expressUsed = _useExpressTicket;
            validators[validatorId] = validator;
        }
        // Store prestake data and pubkey
        prestakeSignatures[validatorId] = _validatorSignature;
        pubkeys[validatorId] = _validatorPubkey;
        // Compute and verify supplied deposit data root is correct
        // Note: We check this here to ensure the deposit contract will not revert when executing prestake
        bytes32 depositDataRoot = _computeDepositDataRoot(_validatorPubkey, _validatorSignature, SafeCast.toUint64(prestakeValue / 1 gwei));
        require(depositDataRoot == _depositDataRoot, "Invalid deposit data root");
        // Increase queued capital balances
        userQueuedCapital += fullDepositValue - _bondAmount;
        nodeQueuedBond += _bondAmount;
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
        uint256 requestedValue = uint256(validator.lastRequestedValue) * milliToWei;
        uint256 nodeValue = uint256(validator.lastRequestedBond) * milliToWei;
        uint256 userValue = requestedValue - nodeValue;
        // Dequeue validator from the deposit pool and issue credit
        RocketDepositPoolInterface rocketDepositPool = _getRocketDepositPool();
        rocketDepositPool.exitQueue(nodeAddress, _validatorId, validator.expressUsed);
        rocketDepositPool.fundsReturned(nodeAddress, nodeValue, userValue);
        rocketDepositPool.applyCredit(nodeAddress, nodeValue);
        // Remove value from queued capital balances
        nodeQueuedBond -= nodeValue;
        userQueuedCapital -= userValue;
        // Increment inactive validator count
        unchecked { // Infeasible overflow
            numInactiveValidators += 1;
        }
        // Verify new bond requirement is met
        RocketNodeDepositInterface rocketNodeDeposit = _getRocketNodeDeposit();
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount());
        require(nodeBond + nodeQueuedBond >= newBondRequirement, "Bond requirement not met");
        // Update validator state
        validator.inQueue = false;
        validator.expressUsed = false;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validators[_validatorId] = validator;
        // Delete prestake signature
        delete prestakeSignatures[_validatorId];
        // Emit event
        emit MegapoolValidatorDequeued(_validatorId, block.timestamp);
    }

    /// @notice Reduces this megapool's bond and applies credit if current bond exceeds requirement
    /// @param _amount Amount in ETH to reduce bond by
    function reduceBond(uint256 _amount) override external onlyMegapoolOwner {
        // Check pre-conditions
        require(_amount > 0, "Invalid amount");
        require(debt == 0, "Cannot reduce bond with debt");
        require(nodeQueuedBond == 0, "Cannot reduce bond with queued validators");
        require(assignedValue == 0, "Cannot reduce bond with prestaked validators");
        // Check bond requirements
        RocketNodeDepositInterface rocketNodeDeposit = _getRocketNodeDeposit();
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(getActiveValidatorCount());
        uint256 effectiveBond = nodeBond;
        require(effectiveBond > newBondRequirement, "Bond is at minimum");
        unchecked { // Impossible underflow given effectiveBond > newBondRequirement
            uint256 maxReduce = effectiveBond - newBondRequirement;
            require(_amount <= maxReduce, "New bond is too low");
        }
        // Reduce node bond
        nodeBond -= _amount;
        userCapital += _amount;
        // Snapshot capital ratio
        _snapshotCapitalRatio();
        // Apply credit
        RocketDepositPoolInterface rocketDepositPool = _getRocketDepositPool();
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
        validator.lastAssignmentTime = SafeCast.toUint32(block.timestamp);
        // Record value assigned from deposit pool (subtract prestakeValue as it is going to deposit contract now)
        validator.depositValue += SafeCast.toUint32(prestakeValue / milliToWei);
        assignedValue += msg.value - prestakeValue;
        validators[_validatorId] = validator;
        // Execute prestake operation
        bytes memory signature = prestakeSignatures[_validatorId];
        bytes memory pubkey = pubkeys[_validatorId];
        bytes32 depositDataRoot = _computeDepositDataRoot(pubkey, signature, SafeCast.toUint64(prestakeValue / 1 gwei));
        casperDeposit.deposit{value: prestakeValue}(pubkey, abi.encodePacked(getWithdrawalCredentials()), signature, depositDataRoot);
        // Remove value from queued balances and add to staking values
        uint256 assignedUserCapital = (validator.lastRequestedValue - validator.lastRequestedBond) * milliToWei;
        uint256 assignedNodeBond = (validator.lastRequestedBond * milliToWei);
        userCapital += assignedUserCapital;
        nodeBond += assignedNodeBond;
        userQueuedCapital -= assignedUserCapital;
        nodeQueuedBond -= assignedNodeBond;
        // Store capital ratio on first assignment
        if (lastDistributionTime == 0) {
            _calculateAndSaveCapitalRatio();
        }
        // Delete prestake signature for a small gas refund (no longer needed)
        delete prestakeSignatures[_validatorId];
        // Emit event
        emit MegapoolValidatorAssigned(_validatorId, block.timestamp);
    }

    /// @notice Performs the remaining ETH deposit on the Beacon Chain
    /// @param _validatorId The internal ID of the validator in this megapool
    function stake(uint32 _validatorId) external onlyRocketMegapoolManager {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.inPrestake, "Validator must be pre-staked");
        // Store last requested value for later
        uint32 lastRequestedValue = validator.lastRequestedValue;
        // Snapshot capital ratio
        _snapshotCapitalRatio();
        // Account for assigned value
        uint256 assignedUsed = lastRequestedValue * milliToWei - prestakeValue;
        assignedValue -= assignedUsed;
        // Update validator status
        validator.staked = true;
        validator.inPrestake = false;
        validator.lastAssignmentTime = 0;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validator.depositValue += SafeCast.toUint32(lastRequestedValue - prestakeValue / milliToWei);
        validators[_validatorId] = validator;
        // Perform remaining 31 ETH stake onto beaconchain
        // Note: Signature is not verified on subsequent deposits and we know the validator is valid due to state proof
        bytes memory signature = hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        bytes memory pubkey = pubkeys[_validatorId];
        bytes32 depositDataRoot = _computeDepositDataRoot(pubkey, signature, SafeCast.toUint64(assignedUsed / 1 gwei));
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
        // Ensure time-before-dissolve period has passed before allowing proof-less dissolution
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        if (msg.sender != rocketStorage.getAddress(rocketMegapoolManagerKey)) {
            uint256 timeBeforeDissolve = rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve();
            require(block.timestamp > validator.lastAssignmentTime + timeBeforeDissolve, "Not enough time has passed");
        }
        // Apply a penalty by increasing debt
        uint256 dissolvePenalty = rocketDAOProtocolSettingsMegapool.getDissolvePenalty();
        _increaseDebt(dissolvePenalty);
        // Update validator info
        validator.inPrestake = false;
        validator.dissolved = true;
        validator.lastAssignmentTime = 0;
        validators[_validatorId] = validator;
        // Decrease total bond used for bond requirement calculations
        uint256 capitalValue = uint256(validator.lastRequestedValue) * milliToWei;
        uint256 recycleValue = capitalValue - prestakeValue;
        (uint256 nodeShare, uint256 userShare) = _calculateCapitalDispersal(capitalValue, getActiveValidatorCount() - 1);
        nodeBond -= nodeShare;
        userCapital -= userShare;
        unchecked { // Infeasible overflow
            numInactiveValidators += 1;
        }
        // Snapshot capital ratio
        _snapshotCapitalRatio();
        // Recycle ETH
        assignedValue -= recycleValue;
        // Calculate the values to send to node and user
        uint256 toUser = userShare;
        if (recycleValue < toUser) {
            uint256 shortFall = toUser - recycleValue;
            toUser -= shortFall;
            _increaseDebt(shortFall);
        }
        uint256 toNode = recycleValue - toUser;
        // Send funds
        RocketDepositPoolInterface rocketDepositPool = _getRocketDepositPool();
        if (toUser > 0) {
            rocketDepositPool.recycleDissolvedDeposit{value: toUser}();
        }
        rocketDepositPool.fundsReturned(nodeAddress, nodeShare, userShare);
        refundValue += toNode;
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
        _sendToRETH(_amount);
        _reduceDebt(_amount);
    }

    /// @notice Distributes any accrued staking rewards
    function distribute() override public {
        // Prevent calls before a megapool's first validator has been staked
        require(lastDistributionTime != 0, "No first validator");
        // Distribute pending rewards
        _distributeAmount(getPendingRewards());
        // If owner is calling, claim immediately
        if (isNodeCalling(msg.sender)) {
            _claim();
        }
    }

    /// @dev Internal implementation of reward distribution process
    /// @param _rewards Amount of rewards to distribute
    function _distributeAmount(uint256 _rewards) internal {
        // Cannot distribute a megapool with exiting or locked validators
        require(numExitingValidators == 0, "Pending validator exit");
        require(numLockedValidators == 0, "Megapool locked");
        // Early out if there are no rewards to distribute
        if (_rewards == 0) {
            // Last distribution time still gets updated
            lastDistributionTime = block.timestamp;
            return;
        }
        (uint256 nodeAmount, uint256 voterAmount, uint256 protocolDAOAmount, uint256 rethAmount) = calculateRewards(_rewards);
        // Update last distribution time for use in calculating time-weighted average commission
        lastDistributionTime = block.timestamp;
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
        _sendToRETH(rethAmount);
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
        emit RewardsDistributed(nodeAmount, voterAmount, rethAmount, protocolDAOAmount, block.timestamp);
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
    function calculatePendingRewards() override public view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards) {
        return calculateRewards(getPendingRewards());
    }

    /// @notice Calculates the split of rewards for a given amount of ETH
    /// @param _amount Amount of rewards in wei to calculate the split of
    function calculateRewards(uint256 _amount) public view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards) {
        // Early out for edge cases
        if (_amount == 0) return (0, 0, 0, 0);
        if (lastDistributionTime == 0) return (_amount, 0, 0, 0);
        // Calculate split based on capital ratio and average commission since last distribute
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        uint64 lastDistributionTime64 = SafeCast.toUint64(lastDistributionTime);
        (, uint256 voterShare, uint256 protocolDAOShare, uint256 rethShare) = rocketNetworkRevenues.calculateSplit(lastDistributionTime64);
        uint256 averageCapitalRatio = rocketNetworkRevenues.getNodeAverageCapitalRatioSince(nodeAddress, lastDistributionTime64);
        // Sanity check input values
        require(averageCapitalRatio <= calcBase, "Invalid average capital ratio");
        require(voterShare + protocolDAOShare + rethShare <= calcBase, "Invalid shares");
        unchecked {
            uint256 borrowedPortion = _amount - (_amount * averageCapitalRatio / calcBase);
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
        // Only the first challenge increments the lock counter, subsequent challenges only update the lockedTime
        if (!validator.locked) {
            validator.locked = true;
            unchecked { // Infeasible overflow
                numLockedValidators += 1;
            }
        }
        // Update lockedTime to current time
        validator.lockedTime = SafeCast.toUint64(block.timestamp);
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorLocked(_validatorId, block.timestamp);
    }

    /// @notice Unlocks a challenged validator
    /// @param _validatorId Internal ID of the validator to lock
    /// @param _slotTimestamp Timestamp of the slot at which it was proved the validator is not exiting
    function notifyNotExit(uint32 _validatorId, uint64 _slotTimestamp) override external onlyRocketMegapoolManager {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(validator.locked, "Validator not locked");
        require(_slotTimestamp >= validator.lockedTime, "Proof is older than challenge");
        // Update validator state to unlocked
        validator.locked = false;
        validator.lockedTime = 0;
        // Decrement locked validator counter
        numLockedValidators -= 1;
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorUnlocked(_validatorId, block.timestamp);
    }

    /// @notice Used to notify the megapool that one of its validators is exiting the beaconchain
    /// @param _validatorId Internal ID of the validator to notify exit for
    /// @param _recentEpoch A recent epoch
    function notifyExit(uint32 _validatorId, uint64 _withdrawableEpoch, uint64 _recentEpoch) override external onlyRocketMegapoolManager {
        // Mark the validator as exiting
        _markValidatorExiting(_validatorId);
        // Apply penalty for late submission
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 notifyThreshold = rocketDAOProtocolSettingsMegapool.getNotifyThreshold();
        if (_recentEpoch > _withdrawableEpoch - notifyThreshold) {
            _increaseDebt(rocketDAOProtocolSettingsMegapool.getLateNotifyFine());
        }
        // Emit event
        emit MegapoolValidatorExiting(_validatorId, block.timestamp);
    }

    /// @notice Used to notify the megapool of the final balance of an exited validator
    /// @param _validatorId Internal ID of the validator to notify final balance of
    /// @param _amountInGwei The amount in the final withdrawal
    /// @param _caller The address which is submitted the final balance (i.e. msg.sender passed from RocketMegapoolManager)
    /// @param _withdrawalEpoch The epoch containing the withdrawal
    /// @param _recentEpoch A recent epoch
    function notifyFinalBalance(uint32 _validatorId, uint64 _amountInGwei, address _caller, uint64 _withdrawalEpoch, uint64 _recentEpoch) override external onlyRocketMegapoolManager {
        // Perform notification process
        bool incursShortfall = _notifyFinalBalance(_validatorId, _amountInGwei);
        // Trigger a deposit of excess collateral from rETH contract to deposit pool
        RocketTokenRETHInterface(rocketTokenRETH).depositExcessCollateral();
        // If owner is calling, claim immediately
        if (isNodeCalling(_caller)) {
            _claim();
        } else {
            // Permissionless distribute requires a wait time depending on if the final balance results in a shortfall of user funds
            RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
            if (incursShortfall) {
                uint256 userDistributeDelay = rocketDAOProtocolSettingsMegapool.getUserDistributeDelayWithShortfall();
                require(uint256(_recentEpoch) >= _withdrawalEpoch + userDistributeDelay, "Not enough time has passed");
            } else {
                uint256 userDistributeDelay = rocketDAOProtocolSettingsMegapool.getUserDistributeDelay();
                require(uint256(_recentEpoch) >= _withdrawalEpoch + userDistributeDelay, "Not enough time has passed");
            }
        }
    }

    /**
     * @notice Permissionlessly force exit a number of validators to reduce deficit below the exit deficit parameter
     * @param _validatorIds List of validators to force exit
     * @param _feeLimit The maximum fee to pay for the EIP-7002 EL exit
     */
    function forceExit(uint32[] calldata _validatorIds, uint256 _feeLimit) override external onlyLatestNetworkContract {
        // Get contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        RocketNodeDepositInterface rocketNodeDeposit = _getRocketNodeDeposit();
        // Get inputs
        uint256 credit = rocketDepositPool.getNodeCreditBalance(nodeAddress);
        (uint256 rewards,,,) = calculatePendingRewards();
        uint256 exitDeficit = rocketDAOProtocolSettingsMegapool.getExitDeficit();
        // Calculate the amount of bond that will be released if all currently exiting validators + forced ones fully exit now
        uint256 numValidatorsToExit = _validatorIds.length;
        uint256 totalExiting = numValidatorsToExit + numExitingValidators;
        uint256 bondReleased = nodeBond - rocketNodeDeposit.getBondRequirement(getActiveValidatorCount() - totalExiting);
        // Project the excess funds available to pay off debt
        uint256 projectedExcess = credit + rewards + bondReleased;
        // Check that debt still exceeds exit deficit after taking into account projected excess
        require (debt >= exitDeficit + projectedExcess, "Deficit too low");
        // Query fee and validate against limit
        uint256 fee = _getExitFee();
        require(fee <= _feeLimit, "Fee limit exceeded");
        // Iterate supplied validator ids, and trigger force exit
        for (uint256 i = 0; i < numValidatorsToExit; ++i) {
            uint32 validatorId = _validatorIds[i];
            // Mark the validator as exiting (validator state checks are performed here)
            _markValidatorExiting(validatorId);
            // Trigger the exit via EIP-7002 EL triggered exit mechanism
            _triggerExit(validatorId, type(uint64).max, fee);
            // Emit event
            emit MegapoolValidatorForceExited(validatorId, block.timestamp);
        }
    }

    /**
     * @dev Marks a validator as being exited and updates internal state to match
     * @param _validatorId Id of the validator to mark as exiting
     */
    function _markValidatorExiting(uint32 _validatorId) internal {
        ValidatorInfo memory validator = validators[_validatorId];
        // Check required state
        require(validator.staked || validator.dissolved, "Not staking or dissolved");
        require(!validator.exiting, "Already notified");
        require(!validator.exited, "Already exited");
        // Update validator state to exiting
        validator.exiting = true;
        // Setup distribution lock
        unchecked { // Infeasible overflow
            numExitingValidators += 1;
        }
        // If validator was locked, notifying exit unlocks it
        if (validator.locked) {
            validator.locked = false;
            validator.lockedTime = 0;
            numLockedValidators -= 1;
        }
        validators[_validatorId] = validator;
    }

    /// @dev Internal implementation of final balance notification process
    /// @param _validatorId Internal ID of the validator to notify final balance of
    /// @param _amountInGwei The amount in the final withdrawal
    /// @return Returns true if the final balance results in a shortfall of user capital
    function _notifyFinalBalance(uint32 _validatorId, uint64 _amountInGwei) internal returns (bool) {
        ValidatorInfo memory validator = validators[_validatorId];
        require(!validator.exited, "Already exited");
        require(validator.exiting, "Validator not exiting");
        bool incursShortfall = false;
        // Mark as exited
        validator.exited = true;
        validator.exiting = false;
        validator.exitBalance = _amountInGwei;
        uint256 withdrawalBalance = uint256(_amountInGwei) * 1 gwei;
        validators[_validatorId] = validator;
        if (!validator.dissolved) {
            // Calculate capital distribution amounts
            uint256 depositBalance = uint256(validator.depositValue) * milliToWei;
            (uint256 nodeShare, uint256 userShare) = _calculateCapitalDispersal(depositBalance, getActiveValidatorCount() - 1);
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
                    incursShortfall = true;
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
                _sendToRETH(toUser);
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
            RocketDepositPoolInterface rocketDepositPool = _getRocketDepositPool();
            rocketDepositPool.fundsReturned(nodeAddress, nodeShare, userShare);
        }
        // Remove distribution lock
        numExitingValidators -= 1;
        // Snapshot capital ratio
        _snapshotCapitalRatio();
        // Emit event
        emit MegapoolValidatorExited(_validatorId, block.timestamp);
        // Return true if final balance results in a shortfall
        return incursShortfall;
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

    /// @dev Helper function to send an amount of ETH to the RETH token conract
    function _sendToRETH(uint256 _amount) internal {
        if (_amount == 0) {
            return;
        }
        (bool success,) = rocketTokenRETH.call{value: _amount}("");
        require(success);
    }

    /// @dev Calculates share of returned capital based on current bond level and requirement
    /// @param _value The amount of ETH capital that is needing to be dispersed
    /// @param _newValidatorCount The number of validators the node will have after this dispersal
    function _calculateCapitalDispersal(uint256 _value, uint256 _newValidatorCount) internal view returns (uint256 _nodeShare, uint256 _userShare) {
        RocketNodeDepositInterface rocketNodeDeposit = _getRocketNodeDeposit();
        uint256 newBondRequirement = rocketNodeDeposit.getBondRequirement(_newValidatorCount);
        uint256 effectiveBond = nodeBond + nodeQueuedBond;
        _nodeShare = 0;
        if (newBondRequirement < effectiveBond) {
            _nodeShare = effectiveBond - newBondRequirement;
        }
        if (_nodeShare > _value) {
            _nodeShare = _value;
        }
        if (_nodeShare > nodeBond) {
            _nodeShare = nodeBond;
        }
        _userShare = _value - _nodeShare;
    }

    /// @dev Convenience function to return interface to RocketDepositPool
    function _getRocketDepositPool() internal view returns (RocketDepositPoolInterface) {
        return RocketDepositPoolInterface(rocketStorage.getAddress(rocketDepositPoolKey));
    }

    /// @dev Convenience function to return interface to RocketNodeDeposit
    function _getRocketNodeDeposit() internal view returns (RocketNodeDepositInterface) {
        return RocketNodeDepositInterface(rocketStorage.getAddress(rocketNodeDepositKey));
    }

    /// @dev Attempts to distribute rewards at current ratio before snapshotting capital ratio
    function _snapshotCapitalRatio() internal {
        // Try to distribute rewards before updating capital ratio
        if (numExitingValidators == 0 && numLockedValidators == 0) {
            _distributeAmount(getPendingRewards());
        }
        // Snapshot capital ratio
        _calculateAndSaveCapitalRatio();
    }

    /// @dev Calculates the current capital ratio of this Megapool and notifies RocketNetworkRevenues to snapshot it
    function _calculateAndSaveCapitalRatio() internal {
        // Calculate and send capital ratio to RocketNetworkRevenues for snapshotting
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        if (nodeBond + userCapital > 0) {
            // Stored as a ratio of node bond / total capital
            uint256 capitalRatio = nodeBond * calcBase / (userCapital + nodeBond);
            rocketNetworkRevenues.setNodeCapitalRatio(nodeAddress, capitalRatio);
        }
    }

    /// @dev Trigger a EIP-7002 execution layer exit for the given validator
    function _triggerExit(uint32 _validatorId, uint64 _amount, uint256 _fee) internal {
        // Retrieve pubkey
        bytes memory pubkey = pubkeys[_validatorId];
        // Queue the withdrawal
        bytes memory callData = abi.encodePacked(pubkey, _amount);
        (bool result,) = withdrawalRequestPredeployAddress.call{value: _fee}(callData);
        require(result, "Failed to queue withdrawal");
    }

    /// @dev Returns the exact current EIP-7002 exit fee
    function _getExitFee() internal view returns (uint256) {
        (bool result, bytes memory feeRaw) = withdrawalRequestPredeployAddress.staticcall('');
        require(result, "Withdrawal fee query failed");
        (uint256 fee) = abi.decode(feeRaw, (uint256));
        return fee;
    }

    /// @dev Mirror deposit contract deposit data root calculation but with in-memory bytes instead of calldata
    function _computeDepositDataRoot(bytes memory pubkey, bytes memory signature, uint64 amount) internal view returns (bytes32 ret) {
        bytes32 withdrawalCredentials = getWithdrawalCredentials();
        assembly {
            let result
            let temp := mload(0x40)

            // [0x00] = pubkey[0x00:0x20]
            // [0x20] = pubkey[0x20:0x30] . bytes16(0)
            mstore(0x00, mload(add(pubkey, 0x20)))
            mstore(0x20, and(mload(add(pubkey, 0x40)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000))

            // temp[0x00] = sha256([0x00:0x40])
            result := staticcall(gas(), 0x02, 0x00, 0x40, temp, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // temp[0x20] = withdrawal_credentials
            mstore(add(temp, 0x20), withdrawalCredentials)

            // temp[0x00] = sha256(temp[0x00:0x40])
            result := staticcall(gas(), 0x02, temp, 0x40, temp, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // temp[0x20] = sha256(signature[0x00:0x40])
            result := staticcall(gas(), 0x02, add(signature, 0x20), 0x40, add(temp, 0x20), 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // [0x00] = signature[0x40]
            // [0x20] = bytes32(0)
            mstore(0x00, mload(add(signature, 0x60)))
            mstore(0x20, 0)

            // [0x20] = sha256([0x00:0x40])
            result := staticcall(gas(), 0x02, 0x00, 0x40, 0x20, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // [0x00] = temp[0x20]
            mstore(0x00, mload(add(temp, 0x20)))

            // [0x20] = sha256([0x00:0x40])
            result := staticcall(gas(), 0x02, 0x00, 0x40, 0x20, 0x20)
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
            result := staticcall(gas(), 0x02, 0x00, 0x40, 0x20, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // [0x00] = temp[0x00]
            mstore(0x00, mload(temp))

            // [0x00] = sha256([0x00:0x40])
            result := staticcall(gas(), 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            // Return [0x00:0x20]
            ret := mload(0x00)
        }
    }
}