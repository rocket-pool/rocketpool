pragma solidity 0.5.0;


import "../RocketBase.sol";


/// @title DisableInactiveNodes - disables nodes that have not checked in recently
/// @author Jake Pospischil

contract DisableInactiveNodes is RocketBase {


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Task name
    function name() public view returns (string memory) { return "DisableInactiveNodes"; }


    /// @dev Run task
    function run(address _nodeAddress) public onlyLatestContract("rocketNodeTasks", msg.sender) returns (bool) {
        
    }


}
