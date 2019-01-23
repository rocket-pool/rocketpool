pragma solidity 0.5.0; 


// Casper deposit contract interface
contract DepositInterface {
    function deposit(bytes memory _depositInput) public payable;
}
