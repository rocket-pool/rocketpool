// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketRewardsPoolInterface} from "../../interface/rewards/RocketRewardsPoolInterface.sol";
import {RocketClaimDAOInterface} from "../../interface/rewards/claims/RocketClaimDAOInterface.sol";
import {IERC20} from "../../interface/util/IERC20.sol";

/// @notice Recipient of pDAO RPL from inflation. Performs treasury spends and handles recurring payments.
contract RocketClaimDAO is RocketBase, RocketClaimDAOInterface {
    // Offsets into storage for contract details
    uint256 constant internal existsOffset = 0;
    uint256 constant internal recipientOffset = 1;
    uint256 constant internal amountOffset = 2;
    uint256 constant internal periodLengthOffset = 3;
    uint256 constant internal lastPaymentOffset = 4;
    uint256 constant internal numPeriodsOffset = 5;
    uint256 constant internal periodsPaidOffset = 6;

    // Events
    event RPLTokensSentByDAOProtocol(string indexed invoiceID, address indexed from, address indexed to, uint256 amount, uint256 time);
    event RPLTreasuryContractPayment(string indexed contractName, address indexed recipient, uint256 amount, uint256 time);
    event RPLTreasuryContractClaimed(address indexed recipient, uint256 amount, uint256 time);
    event RPLTreasuryContractCreated(string indexed contractName, address indexed recipient, uint256 amountPerPeriod, uint256 startTime, uint256 periodLength, uint256 numPeriods);
    event RPLTreasuryContractUpdated(string indexed contractName, address indexed recipient, uint256 amountPerPeriod, uint256 periodLength, uint256 numPeriods);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 4;
    }

    /// @dev Receive pDAO share of rewards from megapool distributions and reward submissions
    receive() payable external {
        // Transfer incoming ETH directly to the vault
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.depositEther{value: msg.value}();
        // Note: There is currently no way to spend this ETH
    }

    /// @notice Returns whether a contract with the given name exists
    /// @param _contractName Name of the contract to check existence of
    function getContractExists(string calldata _contractName) external view returns (bool) {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));
        return getBool(bytes32(contractKey + existsOffset));
    }

    /// @notice Gets details about a given payment contract
    /// @param _contractName Name of the contract to retrieve details for
    function getContract(string calldata _contractName) override external view returns (PaymentContract memory) {
        // Compute key
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));
        // Retrieve details
        PaymentContract memory paymentContract;
        paymentContract.recipient = getAddress(bytes32(contractKey + recipientOffset));
        paymentContract.amountPerPeriod = getUint(bytes32(contractKey + amountOffset));
        paymentContract.periodLength = getUint(bytes32(contractKey + periodLengthOffset));
        paymentContract.lastPaymentTime = getUint(bytes32(contractKey + lastPaymentOffset));
        paymentContract.numPeriods = getUint(bytes32(contractKey + numPeriodsOffset));
        paymentContract.periodsPaid = getUint(bytes32(contractKey + periodsPaidOffset));
        return paymentContract;
    }

    /// @notice Gets the outstanding balance owed to a given recipient
    /// @param _recipientAddress The address of the recipient to return the balance of
    function getBalance(address _recipientAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("dao.protocol.treasury.balance", _recipientAddress)));
    }

    /// @notice Spend the network DAOs RPL rewards
    /// @param _invoiceID A string used to identify this payment (not used internally)
    /// @param _recipientAddress The address to send the RPL spend to
    /// @param _amount The amount of RPL to send
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) onlyLatestContract("rocketClaimDAO", address(this)) {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Addresses
        IERC20 rplToken = IERC20(getContractAddress("rocketTokenRPL"));
        // Some initial checks
        require(_amount > 0 && _amount <= rocketVault.balanceOfToken("rocketClaimDAO", rplToken), "You cannot send 0 RPL or more than the DAO has in its account");
        // Send now
        rocketVault.withdrawToken(_recipientAddress, rplToken, _amount);
        // Log it
        emit RPLTokensSentByDAOProtocol(_invoiceID, address(this), _recipientAddress, _amount, block.timestamp);
    }

    /// @notice Creates a new recurring payment contract
    /// @param _contractName A string used to identify this payment
    /// @param _recipientAddress The address which can claim against this recurring payment
    /// @param _amountPerPeriod The amount of RPL that can be claimed each period
    /// @param _periodLength The length (in seconds) of periods of this contract
    /// @param _startTime A unix timestamp of when payments begin
    /// @param _numPeriods The number of periods this contract pays out for
    function newContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) onlyLatestContract("rocketClaimDAO", address(this)) {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));
        // Ensure contract name uniqueness
        require(getBool(bytes32(contractKey + existsOffset)) == false, "Contract already exists");
        // Write to storage
        setBool(bytes32(contractKey + existsOffset), true);
        setAddress(bytes32(contractKey + recipientOffset), _recipientAddress);
        setUint(bytes32(contractKey + amountOffset), _amountPerPeriod);
        setUint(bytes32(contractKey + periodLengthOffset), _periodLength);
        setUint(bytes32(contractKey + lastPaymentOffset), _startTime);
        setUint(bytes32(contractKey + numPeriodsOffset), _numPeriods);
        // setUint(bytes32(contractKey + periodsPaidOffset), 0);
        // Log it
        emit RPLTreasuryContractCreated(_contractName, _recipientAddress, _amountPerPeriod, _startTime, _periodLength, _numPeriods);
    }

    /// @notice Modifies an existing recurring payment contract
    /// @param _contractName The contract to modify
    /// @param _recipientAddress The address which can claim against this recurring payment
    /// @param _amountPerPeriod The amount of RPL that can be claimed each period
    /// @param _periodLength The length (in seconds) of periods of this contract
    /// @param _numPeriods The number of periods this contract pays out for
    function updateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) onlyLatestContract("rocketClaimDAO", address(this)) {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));
        // Check it exists
        require(getBool(bytes32(contractKey + existsOffset)) == true, "Contract does not exist");
        // Write to storage
        uint256 lastPaymentTime = getUint(bytes32(contractKey + lastPaymentOffset));
        // Payout contract per existing parameters if contract has already started
        if (block.timestamp > lastPaymentTime) {
            payOutContract(_contractName);
        }
        // Update the contract
        setAddress(bytes32(contractKey + recipientOffset), _recipientAddress);
        setUint(bytes32(contractKey + amountOffset), _amountPerPeriod);
        setUint(bytes32(contractKey + periodLengthOffset), _periodLength);
        setUint(bytes32(contractKey + numPeriodsOffset), _numPeriods);
        // Log it
        emit RPLTreasuryContractUpdated(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods);
    }

    /// @notice Can be called to withdraw any paid amounts of RPL to the supplied recipient
    /// @param _recipientAddress The recipient address to claim for
    function withdrawBalance(address _recipientAddress) override public onlyLatestContract("rocketClaimDAO", address(this)) {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Addresses
        IERC20 rplToken = IERC20(getContractAddress("rocketTokenRPL"));
        // Get pending balance
        bytes32 balanceKey = keccak256(abi.encodePacked("dao.protocol.treasury.balance", _recipientAddress));
        uint256 amount = getUint(balanceKey);
        // Zero out pending balance
        setUint(balanceKey, 0);
        // Some initial checks
        require(amount > 0, "No balance to withdraw");
        require(amount <= rocketVault.balanceOfToken("rocketClaimDAO", rplToken), "Insufficient treasury balance for withdrawal");
        // Send now
        rocketVault.withdrawToken(_recipientAddress, rplToken, amount);
        // Log it
        emit RPLTreasuryContractClaimed(_recipientAddress, amount, block.timestamp);
    }

    /// @notice Executes payout on the given contracts
    /// @param _contractNames An array of contract names to execute a payout on
    function payOutContracts(string[] calldata _contractNames) override external onlyLatestContract("rocketClaimDAO", address(this)) {
        uint256 contractNamesLength = _contractNames.length;
        for (uint256 i = 0; i < contractNamesLength; ++i) {
            payOutContract(_contractNames[i]);
        }
    }

    /// @notice Executes a payout on given contracts and withdraws the resulting balance to the recipient
    /// @param _contractNames An array of contract names to execute a payout and withdraw on
    function payOutContractsAndWithdraw(string[] calldata _contractNames) override external onlyLatestContract("rocketClaimDAO", address(this)) {
        uint256 contractNamesLength = _contractNames.length;
        for (uint256 i = 0; i < contractNamesLength; ++i) {
            // Payout contract
            payOutContract(_contractNames[i]);
            // Withdraw to contract recipient
            uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractNames[i])));
            address recipient = getAddress(bytes32(contractKey + recipientOffset));
            withdrawBalance(recipient);
        }
    }

    /// @dev Pays out any outstanding amounts to the recipient of a contract
    function payOutContract(string memory _contractName) internal {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));

        uint256 lastPaymentTime = getUint(bytes32(contractKey + lastPaymentOffset));

        // Payments haven't started yet (nothing to do)
        if (block.timestamp < lastPaymentTime) {
            return;
        }

        uint256 periodLength = getUint(bytes32(contractKey + periodLengthOffset));
        uint256 periodsToPay = (block.timestamp - lastPaymentTime) / periodLength;

        uint256 periodsPaid = getUint(bytes32(contractKey + periodsPaidOffset));
        uint256 numPeriods = getUint(bytes32(contractKey + numPeriodsOffset));

        // Calculate how many periods to pay
        if (periodsToPay + periodsPaid > numPeriods) {
            periodsToPay = numPeriods - periodsPaid;
        }

        // Already paid up to date
        if (periodsToPay == 0) {
            return;
        }

        address recipientAddress = getAddress(bytes32(contractKey + recipientOffset));
        uint256 amountPerPeriod = getUint(bytes32(contractKey + amountOffset));
        uint256 amountToPay = periodsToPay * amountPerPeriod;

        // Update last paid timestamp and periods paid
        setUint(bytes32(contractKey + lastPaymentOffset), lastPaymentTime + (periodsToPay * periodLength));
        setUint(bytes32(contractKey + periodsPaidOffset), periodsPaid + periodsToPay);

        // Add to the recipient's balance
        addUint(keccak256(abi.encodePacked("dao.protocol.treasury.balance", recipientAddress)), amountToPay);

        // Emit event
        emit RPLTreasuryContractPayment(_contractName, recipientAddress, amountToPay, block.timestamp);
    }
}
