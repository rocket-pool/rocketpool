pragma solidity 0.4.24; 


// Our node interface
contract RocketNodeFactoryInterface {
    // Methods
    function createRocketNodeContract(address _nodeAddress) public view returns (address);
}