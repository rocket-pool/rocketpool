pragma solidity 0.4.23;


contract RocketNodeInterface {
    /// @dev Get an available node for a pool to be assigned too, is requested by the main Rocket Pool contract
    function getNodeAvailableForPool() external view returns(address);
    /// @dev Returns the validation code address for a node
    /// @param _nodeAddress node account address.
    function getNodeValCodeAddress(address _nodeAddress) public view returns(address);
}