// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketVaultWithdrawerInterface} from "../../interface/RocketVaultWithdrawerInterface.sol";
import {RocketDAOProtocolSettingsNodeInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketNetworkVotingInterface} from "../../interface/network/RocketNetworkVotingInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {RocketBase} from "../RocketBase.sol";

/// @notice Entry point for node operators to perform deposits for the creation of new validators on the network
contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface, RocketVaultWithdrawerInterface {
    // Constants
    uint256 constant internal pubKeyLength = 48;
    uint256 constant internal signatureLength = 96;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);
    event DepositFor(address indexed nodeAddress, address indexed from, uint256 amount, uint256 time);
    event Withdrawal(address indexed nodeAddress, address indexed to, uint256 amount, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 5;
    }

    /// @notice Accept incoming ETH from the deposit pool
    receive() external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    /// @notice Accept incoming ETH from the vault
    function receiveVaultWithdrawalETH() external payable {}

    /// @notice Returns the bond requirement for the given number of validators
    function getBondRequirement(uint256 _numValidators) override public view returns (uint256) {
        if (_numValidators == 0) {
            return 0;
        }
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate bond requirement
        uint256[] memory baseBondArray = rocketDAOProtocolSettingsNode.getBaseBondArray();
        if (_numValidators - 1 < baseBondArray.length) {
            return baseBondArray[_numValidators - 1];
        }
        uint256 reducedBond = rocketDAOProtocolSettingsNode.getReducedBond();
        return baseBondArray[baseBondArray.length - 1] + (_numValidators - baseBondArray.length) * reducedBond;
    }

    /// @notice Returns a node operator's credit balance in wei
    function getNodeDepositCredit(address _nodeOperator) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)));
    }

    /// @notice Returns the current ETH balance for the given node operator
    function getNodeEthBalance(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)));
    }

    /// @notice Returns the sum of the credit balance of a given node operator and their balance
    function getNodeCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeDepositCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the sum of the amount of ETH credit currently usable by a given node operator and their balance
    function getNodeUsableCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeUsableCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the amount of ETH credit currently usable by a given node operator
    function getNodeUsableCredit(address _nodeAddress) override public view returns (uint256) {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint256 depositPoolBalance = rocketDepositPool.getBalance();
        uint256 usableCredit = getNodeDepositCredit(_nodeAddress);
        if (usableCredit > depositPoolBalance) {
            usableCredit = depositPoolBalance;
        }
        return usableCredit;
    }

    /// @dev Increases a node operators deposit credit balance
    function increaseDepositCreditBalance(address _nodeOperator, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) {
        // Accept calls from network contracts or registered minipools
        require(getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))) ||
        getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))),
            "Invalid or outdated network contract");
        // Increase credit balance
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)), _amount);
    }

    /// @notice Deposits ETH for the given node operator
    /// @param _nodeAddress The address of the node operator to deposit ETH for
    function depositEthFor(address _nodeAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(_nodeAddress) {
        // Send the ETH to vault
        uint256 amount = msg.value;
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.depositEther{value: amount}();
        // Increment balance
        addUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)), amount);
        // Log it
        emit DepositFor(_nodeAddress, msg.sender, amount, block.timestamp);
    }

    /// @notice Withdraws ETH from a node operator's balance. Must be called from withdrawal address.
    /// @param _nodeAddress Address of the node operator to withdraw from
    /// @param _amount Amount of ETH to withdraw
    function withdrawEth(address _nodeAddress, uint256 _amount) external onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(_nodeAddress) {
        // Check valid caller
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(msg.sender == withdrawalAddress, "Only withdrawal address can withdraw ETH");
        // Check balance and update
        uint256 balance = getNodeEthBalance(_nodeAddress);
        require(balance >= _amount, "Insufficient balance");
        setUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)), balance - _amount);
        // Withdraw the funds
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawEther(_amount);
        // Send funds to withdrawalAddress
        (bool success,) = withdrawalAddress.call{value: _amount}("");
        require(success, "Failed to withdraw ETH");
        // Log it
        emit Withdrawal(_nodeAddress, withdrawalAddress, _amount, block.timestamp);
    }

    /// @notice Accept a node deposit and create a new validator under the node. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _useExpressTicket If the express queue should be used 
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    function deposit(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Check amount
        require(msg.value == _bondAmount, "Invalid value");
        // Process the deposit
        _deposit(_bondAmount, _useExpressTicket, _validatorPubkey, _validatorSignature, _depositDataRoot, msg.value);
    }

    /// @notice Accept a node deposit and create a new minipool under the node. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _useExpressTicket If the express queue should be used 
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    function depositWithCredit(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        uint256 balanceToUse = 0;
        uint256 creditToUse = 0;
        uint256 shortFall = _bondAmount - msg.value;
        uint256 credit = getNodeUsableCredit(msg.sender);
        uint256 balance = getNodeEthBalance(msg.sender);
        // Check credit
        require(credit + balance >= shortFall, "Insufficient credit");
        // Calculate amounts to use
        creditToUse = shortFall;
        if (credit < shortFall) {
            balanceToUse = shortFall - credit;
            creditToUse = credit;
        }
        // Update balances
        if (balanceToUse > 0) {
            subUint(keccak256(abi.encodePacked("node.eth.balance", msg.sender)), balanceToUse);
            // Withdraw the funds
            RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
            rocketVault.withdrawEther(balanceToUse);
        }
        if (creditToUse > 0) {
            subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), creditToUse);
        }
        // Process the deposit
        _deposit(_bondAmount, _useExpressTicket, _validatorPubkey, _validatorSignature, _depositDataRoot, msg.value + balanceToUse);
    }

    /// @dev Internal logic to process a deposit
    function _deposit(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _value) private {
        // Validate arguments
        validateBytes(_validatorPubkey, pubKeyLength);
        validateBytes(_validatorSignature, signatureLength);
        // Check pre-conditions
        checkVotingInitialised();
        checkDepositsEnabled();
        // Emit deposit received event
        emit DepositReceived(msg.sender, _value, block.timestamp);
        // Get or deploy a megapool for the caller
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        RocketMegapoolInterface megapool = RocketMegapoolInterface(rocketMegapoolFactory.getOrDeployContract(msg.sender));
        RocketMegapoolManagerInterface rocketMegapoolManager = RocketMegapoolManagerInterface(getContractAddress("rocketMegapoolManager"));
        // Request a new validator from the megapool
        rocketMegapoolManager.addValidator(address(megapool), megapool.getValidatorCount());
        megapool.newValidator(_bondAmount, _useExpressTicket, _validatorPubkey, _validatorSignature, _depositDataRoot);
        // Send node operator's bond to the deposit pool
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.nodeDeposit{value: _value}(_bondAmount);
        // Attempt to assign 1 minipool/megapool
        rocketDepositPool.maybeAssignDeposits(1);
    }

    /// @notice Called by minipools during bond reduction to increase the amount of ETH the node operator has
    /// @param _nodeAddress The node operator's address to increase the ETH matched for
    /// @param _amount The amount to increase the ETH matched
    /// @dev Will revert if the new ETH matched amount exceeds the node operators limit
    ///      Deprecated. Exists only for transition period to megapools
    function increaseEthMatched(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) onlyLatestNetworkContract() {
        // Check amount doesn't exceed limits
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        uint256 ethMatched = rocketNodeStaking.getNodeETHMatched(_nodeAddress) + _amount;
        require(
            ethMatched <= rocketNodeStaking.getNodeETHMatchedLimit(_nodeAddress),
            "ETH matched after deposit exceeds limit based on node RPL stake"
        );
        // Push the change to snapshot manager
        bytes32 key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        rocketNetworkSnapshots.push(key, uint224(ethMatched));
    }

    /// @dev Increases the amount of ETH supplied by a node operator as bond
    function _increaseEthProvided(address _nodeAddress, uint256 _amount) private {
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        uint256 ethProvided = rocketNodeStaking.getNodeETHProvided(_nodeAddress) + _amount;
        bytes32 key = keccak256(abi.encodePacked("eth.provided.node.amount", _nodeAddress));
        rocketNetworkSnapshots.push(key, uint224(ethProvided));
    }

    /// @dev Initialises node's voting power if not already done
    function checkVotingInitialised() private {
        // Ensure voting has been initialised for this node
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        rocketNetworkVoting.initialiseVotingFor(msg.sender);
    }

    /// @dev Reverts if deposits are not enabled
    function checkDepositsEnabled() private {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getDepositEnabled(), "Node deposits are currently disabled");
    }

    /// @notice Validates that a byte array has the expected length
    /// @param _data the byte array being validated
    /// @param _length the expected length
    function validateBytes(bytes memory _data, uint256 _length) pure internal {
        require(_data.length == _length, "Invalid bytes length");
    }
}
