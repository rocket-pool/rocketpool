pragma solidity 0.5.0;


import "../RocketBase.sol";


contract TestNodeTask is RocketBase {


    // Task name
    string private taskName;

    // Counter of times run per node
    mapping(address => uint256) public timesRun;


    // Constructor
    constructor(address _rocketStorageAddress, string memory _taskName) RocketBase(_rocketStorageAddress) public {
        version = 1;
        taskName = _taskName;
    }


    // Task name
    function name() public view returns (string memory) { return taskName; }


    // Run task
    function run(address _nodeAddress) public onlyLatestContract("rocketNodeTasks", msg.sender) returns (bool) {
        timesRun[_nodeAddress] = timesRun[_nodeAddress] + 1;
    }


}
