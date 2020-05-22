pragma solidity 0.6.8;

// An individual node in the Rocket Pool network

contract RocketNodeContract {

    // Make a deposit to create a new minipool
    function deposit() public payable {}

    // Perform a node checkin
    // Only accepts calls from the node owner address
    function checkin() public {}

}
