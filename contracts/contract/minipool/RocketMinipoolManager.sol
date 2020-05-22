pragma solidity 0.6.8;

// Minipool creation, removal and management

contract RocketMinipoolManager {

    // Get the number of available minipools in the network
    function getAvailableMinipoolCount() public returns (uint256) {}

    // Get a random available minipool in the network
    function getRandomAvailableMinipool() public returns (address) {}

    // Create a minipool
    // Only accepts calls from registered nodes
    function createMinipool() public {}

    // Destroy a minipool
    // Only accepts calls from registered minipools
    function destroyMinipool() public {}

}
