pragma solidity 0.4.18;

contract RocketNodeInterface {
    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketPool() {_;}
    /// @dev Get an available node for a pool to be assigned too, is requested by the main Rocket Pool contract
    function getNodeAvailableForPool() external view onlyLatestRocketPool returns(address);
}