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

import "hardhat/console.sol";

/// @title RocketMegapool
/// @notice This contract manages multiple validators. It serves as the target of Beacon Chain withdrawal credentials.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal pubKeyLength = 48;
    uint256 constant internal signatureLength = 96;
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;

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
    /// @param _bondAmount The amount being bonded by the Node Operator for the new validator
    /// @param _useExpressTicket If an express ticket should be used
    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Validate arguments
        validateBytes(_validatorPubkey, pubKeyLength);
        validateBytes(_validatorSignature, signatureLength);
        // Setup new validator
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint32 validatorId = uint32(numValidators);
        numValidators++;
        validators[validatorId].status = Status.InQueue;
        validators[validatorId].express = _useExpressTicket;
        validators[validatorId].pubKey = _validatorPubkey;
        // Store prestake data
        prestakeData[validatorId]._depositDataRoot = _depositDataRoot;
        prestakeData[validatorId]._signature = _validatorSignature;
        // TODO: We might want to store the "amount requested" here in case in future we want to support greater deposit amounts (with Max EB changes coming)
        // Request full deposit amount from deposit pool
        rocketDepositPool.requestFunds(validatorId, fullDepositValue, _useExpressTicket);
        // Emit event
        emit MegapoolValidatorEnqueued(address(this), validatorId, block.timestamp);
    }

    /// @notice Removes a validator from the deposit queue
    /// @param _validatorId the validator ID
    function dequeue(uint32 _validatorId) external onlyMegapoolOwner() {
        // Validate validator status
        require(validators[_validatorId].status == Status.InQueue, "Validator must be in queue");
        // Dequeue validator from the deposit pool
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(_validatorId, validators[_validatorId].express);
        validators[_validatorId].status = Status.Exited;
        // TODO: Apply an ETH credit
        // Emit event
        emit MegapoolValidatorDequeued(address(this), _validatorId, block.timestamp);
    }

    /// @notice Accepts requested funds from the deposit pool
    /// @param _validatorId the validator ID
    function assignFunds(uint32 _validatorId) external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        // Fetch validator data from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.status == Status.InQueue, "Validator must be in queue");
        // Update validator status
        validator.status = Status.PreStaked;
        validator.assignmentTime = uint32(block.timestamp);
        // Record value assigned from deposit pool (subtract prestakeValue as it is going to deposit contract now)
        assignedValue += (msg.value - prestakeValue);
        // Execute prestake operation
        PrestakeData memory validatorPrestakeData = prestakeData[_validatorId];
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        casperDeposit.deposit{value: prestakeValue}(validator.pubKey, getWithdrawalCredentials(), validatorPrestakeData._signature, validatorPrestakeData._depositDataRoot);
        console.log("Prestake deposit made");
        // Update storage
        delete prestakeData[_validatorId];
        validators[_validatorId] = validator;
        // Emit event
        emit MegapoolValidatorAssigned(address(this), _validatorId, block.timestamp);
    }

    /// @notice performs the remaining ETH deposit on the Beacon Chain
    /// @param _validatorId the validator ID
    /// @param _pubKey '
    /// @param _signature '
    /// @param _withdrawalCredentialStateProof '
    function stake(uint32 _validatorId, bytes calldata _pubKey, bytes calldata _signature, bytes32 _depositDataRoot, StateProof calldata _withdrawalCredentialStateProof) external onlyMegapoolOwner() {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Validate validator status
        require(validator.status == Status.PreStaked, "Validator must be pre-staked");
        // Validate arguments
        validateBytes(_pubKey, pubKeyLength);
        validateBytes(_signature, signatureLength);
        // Update validator status
        validators[_validatorId].status = Status.Staking;
        // Account for assigned value
        assignedValue -= fullDepositValue - prestakeValue;
        // Verify withdrawal credentials state proof
        bytes memory withdrawalCredentials = validator.withdrawalCredential;
        // TODO: Verify state proof to ensure validator has correct withdrawal credentials
        // Perform remaining 31 ETH stake onto beaconchain
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // TODO: If we do support support >32 ETH deposits we'll need to update this `fullDepositValue - prestakeValue` to use the stored "amount requested"
        casperDeposit.deposit{value: fullDepositValue - prestakeValue}(_pubKey, withdrawalCredentials, _signature, _depositDataRoot);
    }

    /// @notice Dissolves a validator  
    /// @param _validatorId the validator ID
    function dissolveValidator(uint32 _validatorId) external {
        // Retrieve validator from storage
        ValidatorInfo memory validator = validators[_validatorId];
        // Check current status
        require(validator.status == Status.PreStaked, "The validator can only be dissolved while in PreStaked status");
        // Ensure scrub period has passed before allowing dissolution
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
        require(block.timestamp > validator.assignmentTime + scrubPeriod, "Not past the scrub period");
        // Exit the validator from the queue
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(_validatorId, validator.express);
        // Update the status to dissolved
        validators[_validatorId].status = Status.Dissolved;
        // TODO: Perform the dissolution
    }

    /// @notice Receives ETH, which is sent to the rETH contract, to repay a Megapool debt
    function repayDebt() external payable {
        require(msg.value > 0, "Invalid value received");
        require(debt >= msg.value, "Not enough debt");
        // Send debt payment to rETH contract
        (bool success,) = rocketTokenRETH.call{value: msg.value}("");
        require(success, "Failed to send ETH to the rETH contract");
        // Will not underflow as debt >= msg.value
        unchecked {
            debt -= msg.value;
        }
    }

    /// @notice stakes RPL on the megapool
    /// @param _amount the RPL amount to be staked on this megapool
    function stakeRPL(uint256 _amount) external {
        require(_amount > 0, "Invalid amount");
        // Transfer RPL tokens
        address rplTokenAddress = rocketStorage.getAddress(rocketTokenRPLKey);
        IERC20 rplToken = IERC20(rplTokenAddress);
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        stakedRPL += _amount;
    }

    /// @notice requests RPL previously staked on this megapool to be unstaked
    // @param _amount the RPL amount to be unstaked 
    function requestUnstakeRPL(uint256 _amount) external onlyRPLWithdrawalAddressOrNode() {
        require(_amount > 0 && _amount >= stakedRPL, "Invalid amount");
        stakedRPL -= _amount;
        unstakedRPL += _amount;
        lastUnstakeRequest = block.timestamp;
    }

    /// @notice Unstakes RPL after waiting the 'unstaking period' after the last unstake request
    function unstakeRPL() external onlyRPLWithdrawalAddressOrNode() {
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

    /// @notice validates that a byte array has the expected length
    /// @param _data the byte array being validated
    /// @param _length the expected length
    function validateBytes(bytes memory _data, uint256 _length) pure internal {
        require(_data.length == _length, "Invalid bytes length");
    }

    function getWithdrawalCredentials() public view returns (bytes memory) {
        return abi.encodePacked(bytes1(0x01), bytes11(0x0), address(this));
    }
}