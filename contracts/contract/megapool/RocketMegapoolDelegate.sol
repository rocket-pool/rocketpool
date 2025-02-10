// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {DepositInterface} from "../../interface/casper/DepositInterface.sol";
import {RocketDAONodeTrustedSettingsMinipoolInterface} from "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";
import {ValidatorProof, BeaconStateVerifierInterface} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {IERC20} from "../../interface/util/IERC20.sol";
import {RocketMegapoolDelegateBase} from "./RocketMegapoolDelegateBase.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";

/// @notice This contract manages multiple validators. It serves as the target of Beacon Chain withdrawal credentials.
contract RocketMegapoolDelegate is RocketMegapoolDelegateBase, RocketMegapoolDelegateInterface {
    // Constants
    uint256 constant internal prestakeValue = 1 ether;
    uint256 constant internal fullDepositValue = 32 ether;
    uint256 constant internal milliToWei = 10 ** 15;
    uint256 constant internal calcBase = 1 ether;

    // Events
    event MegapoolValidatorEnqueued(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorAssigned(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event RewardsDistributed(uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount, uint256 time);
    event RewardsClaimed(uint256 amount, uint256 time);

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
            prestake._signature = _validatorSignature;
            prestakeData[validatorId] = prestake;
        }
        // Compute and verify supplied deposit data root is correct
        bytes32 depositDataRoot = computeDepositDataRoot(_validatorPubkey, _validatorSignature, uint64(prestakeValue / 1 gwei));
        require(depositDataRoot == _depositDataRoot, "Invalid deposit data root");
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
        nodeBond -= validator.lastRequestedBond * milliToWei;
        // Increment inactive validator count
        numInactiveValidators++;
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
        bytes32 depositDataRoot = computeDepositDataRoot(validator.pubKey, validatorPrestakeData._signature, uint64(prestakeValue / 1 gwei));
        casperDeposit.deposit{value: prestakeValue}(validator.pubKey, abi.encodePacked(getWithdrawalCredentials()), validatorPrestakeData._signature, depositDataRoot);
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
        // If this is the first validator, then set the last distribution block
        if (lastDistributionBlock == 0) {
            lastDistributionBlock = block.number;
        } else {
            // Otherwise, force a distribution as capital ratio might change below
            _distribute();
        }
        // Account for assigned value
        assignedValue -= lastRequestedValue * milliToWei - prestakeValue;
        userCapital += uint256(lastRequestedValue - validator.lastRequestedBond) * milliToWei;
        nodeCapital += uint256(validator.lastRequestedBond) * milliToWei;
        // Update validator status
        validator.staked = true;
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
        RocketDAOProtocolSettingsMegapoolInterface rocketDAOProtocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 timeBeforeDissolve = rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve();
        require(block.timestamp > validator.lastAssignmentTime + timeBeforeDissolve, "Not enough time has passed to dissolve");
        // Update validator info
        validator.inPrestake = false;
        validator.dissolved = true;
        validators[_validatorId] = validator;
        // Assigned value and refund accounting
        assignedValue -= uint256(validator.lastRequestedValue) * milliToWei - prestakeValue;
        refundValue += uint256(validator.lastRequestedBond) * milliToWei - prestakeValue;
        // Recycle the ETH
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.recycleDissolvedDeposit{value: validator.lastRequestedValue - validator.lastRequestedBond}();
        // TODO: Handle recovery of prestakeValue as part of capital distribution process
    }

    /// @notice Receives ETH, which is sent to the rETH contract, to repay a megapool debt
    function repayDebt() override external payable {
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

    /// @notice Distributes any accrued execution layer rewards sent to this address
    function distribute() override public {
        _distribute();
        // If owner is calling, claim immediately
        // TODO: Should this also check withdrawal address?
        if (msg.sender == nodeAddress) {
            _claim();
        }
    }

    function _distribute() internal {
        // Calculate split of rewards
        uint256 rewards = getPendingRewards();
        (uint256 nodeAmount, uint256 voterAmount, uint256 rethAmount) = _calculateRewards(rewards);
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
        (bool success,) = rocketTokenRETH.call{value: rethAmount}("");
        require(success, "Failed to send ETH to the rETH contract");
        // Send voter share to voting contract
        // TODO: Potential oDAO attack here by making rocketVoterRewards revert on transfer
        address rocketVoterRewards = getContractAddress("rocketVoterRewards");
        (success,) = rocketVoterRewards.call{value: voterAmount}("");
        require(success, "Failed to send voter rewards");
        // Increase node rewards value
        nodeRewards += nodeAmount;
        // Emit event
        emit RewardsDistributed(nodeAmount, voterAmount, rethAmount, block.timestamp);
    }

    /// @notice Claims any distributed but unclaimed rewards
    function claim() override public onlyMegapoolOwner() {
        _claim();
    }

    function _claim() internal {
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
        // Zero out rewards
        nodeRewards = 0;
        // Send to withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        (bool success,) = nodeWithdrawalAddress.call{value: amountToSend}("");
        require(success, "Failed to send ETH to the node operator");
        // Emit event
        emit RewardsClaimed(amountToSend, block.timestamp);
    }

    /// @notice Returns the number of validators created for this megapool
    function getValidatorCount() override external view returns (uint32) {
        return numValidators;
    }

    /// @notice Returns the number of validators that are considered for bond requirement
    function getActiveValidatorCount() override external view returns (uint32) {
        return numValidators - numInactiveValidators;
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

    function calculatePendingRewards() override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        return _calculateRewards(getPendingRewards());
    }

    function calculateRewards(uint256 _amount) override external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        return _calculateRewards(_amount);
    }

    function _calculateRewards(uint256 _rewards) internal view returns (uint256 nodeRewards, uint256 voterRewards, uint256 rethRewards) {
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        (, uint256 voterShare, uint256 rethShare) = rocketNetworkRevenues.calculateSplit(lastDistributionBlock);
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

    function getLastDistributionBlock() override external view returns (uint256) {
        return lastDistributionBlock;
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
                revert(0,0)
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