// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketVaultWithdrawerInterface} from "../../interface/RocketVaultWithdrawerInterface.sol";
import {RocketDAOProtocolSettingsNodeInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {RocketBase} from "../RocketBase.sol";

/// @notice Entry point for node operators to perform deposits for the creation of new validators on the network
contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface, RocketVaultWithdrawerInterface {
    // Constants
    uint256 constant internal pubKeyLength = 48;
    uint256 constant internal signatureLength = 96;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);
    event MultiDepositReceived(address indexed from, uint256 numberOfValidators, uint256 totalBond, uint256 time);
    event DepositFor(address indexed nodeAddress, address indexed from, uint256 amount, uint256 time);
    event Withdrawal(address indexed nodeAddress, address indexed to, uint256 amount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 5;
    }

    /// @notice Accept incoming ETH from the deposit pool
    receive() external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    /// @notice Accept incoming ETH from the vault
    function receiveVaultWithdrawalETH() external payable {}

    /// @notice Returns the bond requirement for the given number of validators
    /// @param _numValidators The number of validator to calculate the bond requirement for
    function getBondRequirement(uint256 _numValidators) override public view returns (uint256) {
        if (_numValidators == 0) {
            return 0;
        }
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate bond requirement (per RPIP-42)
        uint256[] memory baseBondArray = rocketDAOProtocolSettingsNode.getBaseBondArray();
        if (_numValidators - 1 < baseBondArray.length) {
            return baseBondArray[_numValidators - 1];
        }
        uint256 reducedBond = rocketDAOProtocolSettingsNode.getReducedBond();
        return baseBondArray[baseBondArray.length - 1] + (_numValidators - baseBondArray.length) * reducedBond;
    }

    /// @notice Returns a node operator's credit balance in ETH
    /// @param _nodeAddress Address of the node operator to query for
    function getNodeDepositCredit(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeAddress)));
    }

    /// @notice Returns the current ETH balance for the given node operator
    /// @param _nodeAddress Address of the node operator to query for
    function getNodeEthBalance(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)));
    }

    /// @notice Returns the sum of the credit balance of a given node operator and their balance
    /// @param _nodeAddress Address of the node operator to query for
    function getNodeCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeDepositCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the sum of the amount of ETH credit currently usable by a given node operator and their balance
    /// @param _nodeAddress Address of the node operator to query for
    function getNodeUsableCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeUsableCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the amount of ETH credit currently usable by a given node operator
    /// @param _nodeAddress Address of the node operator to query for
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
    /// @param _nodeAddress Address of the node operator to increase deposit balance for
    /// @param _amount Amount to increase deposit credit balance by
    function increaseDepositCreditBalance(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) {
        // Accept calls from network contracts or registered minipools
        require(
            (
                getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))) ||
                getBool(keccak256(abi.encodePacked("contract.exists", msg.sender)))
            ),
            "Invalid or outdated network contract"
        );
        // Increase credit balance
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeAddress)), _amount);
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

    /// @notice Accept a node deposit and create a new validator under the node. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _useExpressTicket If the express queue should be used 
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    function depositWithCredit(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Process the deposit
        uint256 balanceToUse = useCreditOrBalanceIfRequired(_bondAmount);
        _deposit(_bondAmount, _useExpressTicket, _validatorPubkey, _validatorSignature, _depositDataRoot, msg.value + balanceToUse);
    }

    /// @notice Processes multiple node deposits in one call
    /// @param _deposits Array of deposits to process
    function depositMulti(NodeDeposit[] calldata _deposits) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Check pre-conditions
        require(_deposits.length > 0, "Must perform at least 1 deposit");
        checkDepositsEnabled();
        // Get or deploy a megapool for the caller
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        RocketMegapoolInterface megapool = RocketMegapoolInterface(rocketMegapoolFactory.getOrDeployContract(msg.sender));
        RocketMegapoolManagerInterface rocketMegapoolManager = RocketMegapoolManagerInterface(getContractAddress("rocketMegapoolManager"));
        // Iterate deposits and execute
        uint256 totalBond = 0;
        for (uint256 i = 0; i < _deposits.length; ++i) {
            NodeDeposit calldata deposit = _deposits[i];
            // Validate arguments
            validateBytes(deposit.validatorPubkey, pubKeyLength);
            validateBytes(deposit.validatorSignature, signatureLength);
            // Request a new validator from the megapool
            rocketMegapoolManager.addValidator(address(megapool), megapool.getValidatorCount());
            megapool.newValidator(deposit.bondAmount, deposit.useExpressTicket, deposit.validatorPubkey, deposit.validatorSignature, deposit.depositDataRoot);
            // Sum bond total
            totalBond += deposit.bondAmount;
        }
        // Check if node sent full bond amount of if we need to use credit/balance
        uint256 balanceToUse = 0;
        if (msg.value < totalBond) {
            balanceToUse = useCreditOrBalanceIfRequired(totalBond);
        }
        // Emit deposit received event
        emit MultiDepositReceived(msg.sender, _deposits.length, totalBond, block.timestamp);
        // Send node operator's bond to the deposit pool
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.nodeDeposit{value: msg.value + balanceToUse}(totalBond);
        // Attempt to assign 1 minipool/megapool for each deposit
        rocketDepositPool.maybeAssignDeposits(_deposits.length);
    }

    /// @dev Internal logic to process a deposit
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _useExpressTicket If the express queue should be used
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    /// @param _value Total value of the deposit including any credit balance used
    function _deposit(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _value) private {
        // Validate arguments
        validateBytes(_validatorPubkey, pubKeyLength);
        validateBytes(_validatorSignature, signatureLength);
        // Check pre-conditions
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

    /// @dev If msg.value does not cover the bond amount, take from node's credit / balance to make up the difference
    ///      Reverts if node does not have enough credit or ETH balance to cover the shortfall
    /// @return Returns the amount of ETH withdrawn from the vault from the node's ETH balance
    function useCreditOrBalanceIfRequired(uint256 _bondAmount) private returns (uint256) {
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
        return balanceToUse;
    }
}
