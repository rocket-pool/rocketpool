pragma solidity 0.6.8;

// Watchtower (oracle) node functions

contract RocketNodeWatchtower {

    // Mark a minipool as exited
    // Only accepts calls from trusted nodes
    function exitMinipool(address _minipool) public {}

    // Mark a minipool as withdrawable and record its final balance
    // Only accepts calls from trusted nodes
    function withdrawMinipool(address _minipool, uint256 _withdrawalBalance) public {}

}
