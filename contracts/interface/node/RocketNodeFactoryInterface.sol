pragma solidity 0.5.0; 


// Our node interface
contract RocketNodeFactoryInterface {
    // Methods
    function createRocketNodeContract(address _nodeOwnerAddress) public returns(address);
}