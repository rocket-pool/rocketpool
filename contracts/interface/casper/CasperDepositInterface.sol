pragma solidity 0.4.24; 


// Casper interface
contract CasperDepositInterface {
    // Getters
    function deposit(bytes32 _pubkey, uint _withdrawalShardID, address _withdrawalAddressbytes32, bytes32 _randaoCommitment) public payable;
}