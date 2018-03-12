pragma solidity 0.4.19;


contract RocketNodeInterface {
    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketPool() {_;}
    /// @dev Only registered pool node addresses can access
    /// @param _nodeAccountAddress node account address.
    modifier onlyRegisteredNode(address _nodeAccountAddress) {_;} 
    /// @dev Get an available node for a pool to be assigned too, is requested by the main Rocket Pool contract
    function getNodeAvailableForPool() external view onlyLatestRocketPool returns(address);
    /// @dev Returns the validation code address for a node
    /// @param _nodeAddress node account address.
    function getNodeValCodeAddress(address _nodeAddress) public view onlyRegisteredNode(_nodeAddress) returns(address);
}