pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

/// @title An interface for Caspers methods that RocketPool will need (this will obviously change a bit until Casper is spec'd 100%, but allows for easier integration)
/// @author David Rugendyke

contract CasperInterface is Ownable {
    /// @dev A valid registered node validation code
    modifier registeredValidator(address validatorSenderAddress) {_;}
    /// @dev Deposit at the casper contract
    function deposit(address newWithdrawalAddress) public payable returns(bool);
    /// @dev Starting the withdrawal process from Casper
    function startWithdrawal() public registeredValidator(msg.sender) returns(bool);
    /// @dev The withdrawal function
    function withdraw(bool simulatePenalties) public registeredValidator(msg.sender) returns(bool);
    /// @dev Not documented in Casper yet, but would be agreat method to have that would allow users/contracts to know exactly when they can withdraw their deposit by returning a timestamp of it
    function getWithdrawalEpoch(address validatorSenderAddress) public registeredValidator(validatorSenderAddress) returns(uint256);
    /// @dev Set the Withdrawal Epoch - used for unit testing purposes in Rocket Pool
    function setWithdrawalEpoch(address validatorSenderAddress, uint256 newWithdrawalEpoch) public onlyOwner registeredValidator(validatorSenderAddress); 
}