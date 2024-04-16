// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface RocketClaimDAOInterface {
    // Struct for returning data about a payment contract
    struct PaymentContract {
        address recipient;
        uint256 amountPerPeriod;
        uint256 periodLength;
        uint256 lastPaymentTime;
        uint256 numPeriods;
        uint256 periodsPaid;
    }

    function getContractExists(string calldata _contractName) external view returns (bool);
    function getContract(string calldata _contractName) external view returns (PaymentContract memory);
    function getBalance(address _recipientAddress) external view returns (uint256);
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
    function newContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) external;
    function updateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) external;
    function withdrawBalance(address _recipientAddress) external;
    function payOutContracts(string[] calldata _contractNames) external;
    function payOutContractsAndWithdraw(string[] calldata _contractNames) external;
}
