pragma solidity 0.5.0;


import "../../../RocketBase.sol";


/// @title CalculateNodeFee - calculates the node operator fee based on the median value
/// @author Jake Pospischil

contract CalculateNodeFee is RocketBase {


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Task name
    function name() public pure returns (string memory) { return "CalculateNodeFee"; }


    /// @dev Run task
    function run(address _nodeAddress) public onlyLatestContract("rocketNodeTasks", msg.sender) returns (bool) {
        
    }


}
