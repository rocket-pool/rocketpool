// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";
import {RocketMegapoolProxy} from "./RocketMegapoolProxy.sol";
import "./RocketMegapoolDelegateBase.sol";

import {BeaconStateVerifier} from "../util/BeaconStateVerifier.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";

/// @title RocketMegapool
/// @notice This contract manages multiple validators. It serves as the target of Beacon Chain withdrawal credentials.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;
    uint256 constant internal milliToWei = 10**15;
    uint256 constant internal calcBase = 1 ether;

    // Events
    event MegapoolValidatorEnqueued(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorAssigned(address indexed megapool, uint256 indexed validatorId, uint256 time);

    // Immutables
    bytes32 immutable internal rocketTokenRPLKey;
    bytes32 immutable internal rocketVaultKey;
    address payable immutable internal rocketTokenRETH;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketMegapoolDelegateBase(_rocketStorageAddress, 1) {
        // Precompute keys
        rocketVaultKey = keccak256(abi.encodePacked("contract.address", "rocketVault"));
        rocketTokenRPLKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRPL"));
        rocketTokenRETH = payable(getContractAddress("rocketTokenRETH"));
    }

    /// @notice Gets the Node address associated to this megapool
    function getNodeAddress() public override view returns (address) {
        return nodeAddress;
    }

    /// @notice Creates a new validator as part of a megapool
    /// @param _useExpressTicket If an express ticket should be used
    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Setup new validator
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint32 validatorId = uint32(numValidators);
        numValidators++;
        {
            ValidatorInfo memory validator;
            validator.inQueue = true;
            validator.lastRequestedBond = uint32(_bondAmount / milliToWei);
            validator.lastRequestedValue = uint32(fullDepositValue / milliToWei);
            validator.expressUsed = _useExpressTicket;
            validator.pubKey = _validatorPubkey;
            validator.lastAssignmentTime = 0;
            validators[validatorId] = validator;
        }
        // Store prestake data
        {
            PrestakeData memory prestake;
            prestake._depositDataRoot = _depositDataRoot;
            prestake._signature = _validatorSignature;
            prestakeData[validatorId] = prestake;
        }
        // Increase total bond used for bond requirement calculations
        nodeBond += _bondAmount;
        // Request full deposit amount from deposit pool
        rocketDepositPool.requestFunds(_bondAmount, validatorId, fullDepositValue, _useExpressTicket);
        // Emit event
        emit MegapoolValidatorEnqueued(address(this), validatorId, block.timestamp);
    }

    /// @notice Removes a validator from the deposit queue
    /// @param _validatorId the validator ID
    function dequeue(uint32 _validatorId) external onlyMegapoolOwner {
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.inQueue, "Validator must be in queue");
        // Dequeue validator from the deposit pool
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(_validatorId, validator.expressUsed);
        // Decrease total bond used for bond requirement calculations
        nodeBond -= validator.lastRequestedBond;
        // Update validator state
        validator.inQueue = false;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorDequeued(address(this), _validatorId, block.timestamp);
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
        validators[_validatorId] = validator;
        // Record value assigned from deposit pool (subtract prestakeValue as it is going to deposit contract now)
        assignedValue += msg.value - prestakeValue;
        // Execute prestake operation
        PrestakeData memory validatorPrestakeData = prestakeData[_validatorId];
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        casperDeposit.deposit{value: prestakeValue}(validator.pubKey, abi.encodePacked(getWithdrawalCredentials()), validatorPrestakeData._signature, validatorPrestakeData._depositDataRoot);
        // Clean up prestake data
        delete prestakeData[_validatorId];
        // Emit event
        emit MegapoolValidatorAssigned(address(this), _validatorId, block.timestamp);
    }

    /// @notice Performs the remaining ETH deposit on the Beacon Chain
    /// @param _validatorId The validator ID
    /// @param _signature The signature over the deposit data
    /// @param _proof A proof struct proving the withdrawal credentials of the validator
    function stake(uint32 _validatorId, bytes calldata _signature, bytes32 _depositDataRoot, ValidatorProof calldata _proof) external onlyMegapoolOwner() {
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
        // TODO: We might have to force a distribution before adjusting capital ratio?
        if (lastDistributionBlock == 0) {
            lastDistributionBlock = block.number;
        }
        // Account for assigned value
        assignedValue -= lastRequestedValue * milliToWei - prestakeValue;
        userCapital += uint256(lastRequestedValue - validator.lastRequestedBond) * milliToWei;
        nodeCapital += uint256(validator.lastRequestedBond) * milliToWei;
        // Update validator status
        validator.active = true;
        validator.inPrestake = false;
        validator.lastAssignmentTime = 0;
        validator.lastRequestedBond = 0;
        validator.lastRequestedValue = 0;
        validators[_validatorId] = validator;
        // Verify state proof to ensure validator has correct withdrawal credentials
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_proof), "Invalid proof");
        // Perform remaining 31 ETH stake onto beaconchain
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        casperDeposit.deposit{value: (lastRequestedValue * milliToWei) - prestakeValue}(validator.pubKey, abi.encodePacked(withdrawalCredentials), _signature, _depositDataRoot);
    }

    /// @notice Dissolves a validator that has not staked within the required period
    /// @param _validatorId the validator ID to dissolve
    function dissolveValidator(uint32 _validatorId) override external {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Check current status
        require(validator.inPrestake, "The validator can only be dissolved while in PreStaked status");
        // Ensure scrub period has passed before allowing dissolution
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getDissolvePeriod();
        require(block.timestamp > validator.lastAssignmentTime + scrubPeriod, "Not past the dissolve period");
        // Update validator info
        validator.inPrestake = false;
        validator.dissolved = true;
        validators[_validatorId] = validator;
        // Assigned value and refund accounting
        assignedValue -= uint256(validator.lastRequestedValue) * milliToWei - prestakeValue;
        refundValue += uint256(validator.lastRequestedBond) * milliToWei - prestakeValue;
        // Recycle the ETH
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.recycleDissolvedDeposit{value : validator.lastRequestedValue - validator.lastRequestedBond}();
        // TODO: Handle recovery of prestakeValue as part of capital distribution process
    }

    /// @notice Receives ETH, which is sent to the rETH contract, to repay a megapool debt
    function repayDebt() external payable {
        require(msg.value > 0, "Invalid value received");
        _repayDebt(msg.value);
    }

    function _repayDebt(uint256 _amount) internal {
        require(debt >= _amount, "Not enough debt");
        // Send debt payment to rETH contract
        (bool success,) = rocketTokenRETH.call{value: _amount}("");
        require(success, "Failed to send ETH to the rETH contract");
        // Will not underflow as debt >= _amount
        unchecked {
            debt -= _amount;
        }
    }

    /// @notice Stakes RPL on the megapool
    /// @param _amount the RPL amount to be staked on this megapool
    function stakeRPL(uint256 _amount) external {
        revert("Not implemented");
        require(_amount > 0, "Invalid amount");
        // Transfer RPL tokens
        address rplTokenAddress = rocketStorage.getAddress(rocketTokenRPLKey);
        IERC20 rplToken = IERC20(rplTokenAddress);
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        stakedRPL += _amount;
    }

    /// @notice Requests RPL previously staked on this megapool to be unstaked
    // @param _amount the RPL amount to be unstaked 
    function requestUnstakeRPL(uint256 _amount) external onlyRPLWithdrawalAddressOrNode() {
        revert("Not implemented");
        require(_amount > 0 && _amount >= stakedRPL, "Invalid amount");
        stakedRPL -= _amount;
        unstakedRPL += _amount;
        lastUnstakeRequest = block.timestamp;
    }

    /// @notice Unstakes RPL after waiting the 'unstaking period' after the last unstake request
    function unstakeRPL() external onlyRPLWithdrawalAddressOrNode() {
        revert("Not implemented");
        RocketDAOProtocolSettingsMegapoolInterface protocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 unstakingPeriod = protocolSettingsMegapool.getUnstakingPeriod();
        require(lastUnstakeRequest + unstakingPeriod >= block.timestamp, "Not enough time passed since last unstake RPL request");
        address rplWithdrawalAddress;

        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(nodeAddress)) {
            rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);
        } else {
            rplWithdrawalAddress = nodeAddress;
        }

        address rplAddress = rocketStorage.getAddress(rocketTokenRPLKey);

        uint256 unstakedAmount = unstakedRPL;
        unstakedRPL = 0;

        RocketVaultInterface rocketVault = RocketVaultInterface(rocketStorage.getAddress(rocketVaultKey));
        rocketVault.withdrawToken(rplWithdrawalAddress, IERC20(rplAddress), unstakedAmount);
    }

    function distribute() external {
        revert("Not implemented");
        // Calculate split of rewards
        uint256 rewards = getPendingRewards();
        (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) = _calculateRewards(rewards);
        lastDistributionBlock = block.number;
        // Maybe repay debt from node share
        if (debt > 0) {
            uint256 amountToRepay = nodeRewards;
            if (amountToRepay > debt) {
                amountToRepay = debt;
            }
            nodeRewards -= amountToRepay;
            _repayDebt(amountToRepay);
        }
        // Send user share to rETH
        (bool success,) = rocketTokenRETH.call{value: rethRewards}("");
        require(success, "Failed to send ETH to the rETH contract");
        // TODO: Send voterShare to a holding contract for use in rewards tree generation
        // Increase node rewards value
        nodeRewards += nodeRewards;
        // If owner is calling, claim immediately
        // TODO: Should this also check withdrawal address?
        if (msg.sender == nodeAddress) {
            claim();
        }
    }

    function claim() public onlyMegapoolOwner() {
        revert("Not implemented");
        uint256 amountToSend = nodeRewards;
        if (debt > 0) {
            if (debt > amountToSend) {
                debt -= amountToSend;
                nodeRewards = 0;
                return;
            } else {
                debt = 0;
                amountToSend -= debt;
            }
        }
        nodeRewards = 0;
        // Send to withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        (bool success,) = nodeWithdrawalAddress.call{value: amountToSend}("");
        require(success, "Failed to send ETH to the node operator");
    }

    /// @notice Returns the number of validators created for this megapool
    function getValidatorCount() override external view returns (uint256) {
        return numValidators;
    }

    /// @notice Returns information about a given validator
    function getValidatorInfo(uint32 _validatorId) override external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory) {
        return validators[_validatorId];
    }

    function getAssignedValue() override external view returns (uint256) {
        return assignedValue;
    }

    function getDebt() override external view returns (uint256) {
        return debt;
    }

    function getRefundValue() override external view returns (uint256) {
        return refundValue;
    }

    function getNodeCapital() override external view returns (uint256) {
        return nodeCapital;
    }

    function getNodeBond() override external view returns (uint256) {
        return nodeBond;
    }

    function getUserCapital() override external view returns (uint256) {
        return userCapital;
    }

    function calculateRewards() override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        return _calculateRewards(getPendingRewards());
    }

    function _calculateRewards(uint256 _rewards) internal view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        (uint256 nodeShare, uint256 voterShare, uint256 rethShare) = rocketNetworkRevenues.calculateSplit(lastDistributionBlock);
        uint256 borrowedPortion = _rewards * userCapital / (nodeCapital + userCapital);
        rethRewards = rethShare * borrowedPortion / calcBase;
        voterRewards = voterShare * borrowedPortion / calcBase;
        nodeRewards = _rewards - rethRewards - voterRewards;
    }

    function getPendingRewards() override public view returns (uint256) {
        return
            address(this).balance
            - refundValue
            - assignedValue;
    }

    /// @notice Returns the expected withdrawal credentials for any validator within this megapool
    function getWithdrawalCredentials() override public view returns (bytes32) {
        return bytes32((uint256(0x01) << 248) | uint256(uint160(address(this))));
    }

    //
    // TODO: Remove these functions once proper functionality is in place
    //

    function setDebt(uint256 _debt) external {
        require(msg.sender == rocketStorage.getGuardian(), "Not guardian");
        debt = _debt;
    }
}