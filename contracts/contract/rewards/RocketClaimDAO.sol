// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/rewards/RocketRewardsPoolInterface.sol";
import "../../interface/rewards/claims/RocketClaimDAOInterface.sol";

/// @notice Recipient of pDAO RPL from inflation
contract RocketClaimDAO is RocketBase, RocketClaimDAOInterface {

    // Events
    event RPLTokensSentByDAOProtocol(string invoiceID, address indexed from, address indexed to, uint256 amount, uint256 time);
    event RPLTreasuryContractPayment(string contractName, address indexed recipient, uint256 amount, uint256 time);
    event RPLTreasuryContractClaimed(address indexed recipient, uint256 amount, uint256 time);
    event RPLTreasuryContractCreated(string contractName, address indexed recipient, uint256 amountPerPeriod, uint256 startTime, uint256 periodLength, uint256 numPeriods);
    event RPLTreasuryContractUpdated(string contractName, address indexed recipient, uint256 amountPerPeriod, uint256 periodLength, uint256 numPeriods);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 3;
    }

    // Spend the network DAOs RPL rewards
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
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

    function newContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));

        // Ensure contract name uniqueness
        require(getBool(bytes32(contractKey + 0)) == false, "Contract already exists");
        setBool(bytes32(contractKey + 0), true);

        setAddress(bytes32(contractKey + 1), _recipientAddress);
        setUint(bytes32(contractKey + 2), _amountPerPeriod);
        setUint(bytes32(contractKey + 3), _periodLength);
        setUint(bytes32(contractKey + 4), _startTime);
        setUint(bytes32(contractKey + 5), _numPeriods);
    }

    function updateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));

        require(getBool(bytes32(contractKey + 0)) == true, "Contract does not exist");

        uint256 startTime = getUint(bytes32(contractKey + 4));

        // Payout contract per existing parameters if contract has already started
        if (block.timestamp > startTime) {
            payOutContract(_contractName);
        }

        // Update the contract
        setAddress(bytes32(contractKey + 1), _recipientAddress);
        setUint(bytes32(contractKey + 2), _amountPerPeriod);
        setUint(bytes32(contractKey + 3), _periodLength);
        setUint(bytes32(contractKey + 5), _numPeriods);
    }

    function payOutContract(string memory _contractName) internal {
        uint256 contractKey = uint256(keccak256(abi.encodePacked("dao.protocol.treasury.contract", _contractName)));

        uint256 lastPaidTime = getUint(bytes32(contractKey + 4));

        // Payments haven't started yet
        if (block.timestamp < lastPaidTime) {
            return;
        }

        uint256 periodLength = getUint(bytes32(contractKey + 3));
        uint256 periodsToPay = (block.timestamp - lastPaidTime) / periodLength;

        // Already paid up to date
        if (periodsToPay == 0) {
            return;
        }

        uint256 periodsPaid = getUint(bytes32(contractKey + 6));
        uint256 numPeriods = getUint(bytes32(contractKey + 5));

        // Calculate how many periods to pay
        if (periodsToPay + periodsPaid > numPeriods) {
            periodsToPay = numPeriods - periodsPaid;
        }

        address recipientAddress = getAddress(bytes32(contractKey + 1));
        uint256 amountPerPeriod = getUint(bytes32(contractKey + 2));
        uint256 amountToPay = periodsToPay * amountPerPeriod;

        // Update last paid timestamp and periods paid
        setUint(bytes32(contractKey + 4), lastPaidTime + (periodsToPay * periodLength));
        setUint(bytes32(contractKey + 6), periodsPaid + periodsToPay);

        // Add to the recipient's balance
        addUint(keccak256(abi.encodePacked("dao.protocol.treasury.balance", recipientAddress)), amountToPay);

        // Emit event
        emit RPLTreasuryContractPayment(_contractName, recipientAddress, amountToPay, block.timestamp);
    }

    function withdrawBalance(address _recipientAddress) override external {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Addresses
        IERC20 rplToken = IERC20(getContractAddress("rocketTokenRPL"));
        // Amount
        uint256 amount = getUint(keccak256(abi.encodePacked("dao.protocol.treasury.balance", _recipientAddress)));
        // Some initial checks
        require(amount > 0 && amount <= rocketVault.balanceOfToken("rocketClaimDAO", rplToken), "You cannot send 0 RPL or more than the DAO has in its account");
        // Send now
        rocketVault.withdrawToken(_recipientAddress, rplToken, amount);
        // Log it
//        emit RPLTokensSentByDAOProtocol(_recipientAddress, amount, block.timestamp);
    }
}

