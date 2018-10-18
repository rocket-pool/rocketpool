pragma solidity 0.4.24; 


// Validator registration contract interface
contract ValidatorRegistrationInterface {
    // Getters
    function deposit(bytes32 _pubkey, uint _withdrawalShardID, address _withdrawalAddressbytes32, bytes32 _randaoCommitment) public payable;
}