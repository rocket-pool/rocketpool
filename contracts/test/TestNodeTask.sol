pragma solidity 0.4.24;


import "../RocketBase.sol";


contract TestNodeTask is RocketBase {


    // Task name
    string private taskName;

    // Counter of times run per node
    mapping(address => uint256) public timesRun;


    // Constructor
    constructor(string _taskName) public { taskName = _taskName; }


    // Task name
    function name() public view returns (string) { return taskName; }


    // Run task
    function run(address _nodeAddress) public returns (bool) {
        timesRun[_nodeAddress] = timesRun[_nodeAddress] + 1;
    }


}
