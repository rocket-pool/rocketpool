pragma solidity 0.5.8;

contract DepositInterface {
    function deposit(bytes memory _depositInput) public payable;
}
