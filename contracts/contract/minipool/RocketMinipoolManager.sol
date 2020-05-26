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

    // Progress a minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from registered nodes
    function stakeMinipool(address _minipool, bytes memory _validatorPubkey, bytes memory _validatorSignature, bytes32 _depositDataRoot) public {}

    // Mark a minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool(address _minipool) public {}

    // Mark a minipool as withdrawable and record its final balance
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(address _minipool, uint256 _withdrawalBalance) public {}

    // Withdraw rewards from a minipool and close it
    // Only accepts calls from registered nodes
    function closeMinipool(address _minipool) public {}

}
