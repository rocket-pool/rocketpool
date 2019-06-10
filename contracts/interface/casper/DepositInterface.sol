pragma solidity 0.5.8;

contract DepositInterface {
    function deposit(bytes memory _pubkey, bytes memory _withdrawalCredentials, bytes memory _signature) public payable;
}
