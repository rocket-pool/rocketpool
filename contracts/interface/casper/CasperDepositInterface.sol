pragma solidity 0.4.24; 


// Casper interface
contract CasperDepositInterface {
    // Getters
    function deposit(bytes32 _pubkey, uint256 _withdrawal_shard_id, address _withdrawal_address, bytes32 _randao_commitment) public payable;
}