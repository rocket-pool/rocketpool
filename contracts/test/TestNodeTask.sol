pragma solidity 0.4.24;


import "../RocketBase.sol";


contract TestNodeTask is RocketBase {


    // Task name
    string private name;

    // Counter of times run per node
    mapping(address => uint256) public timesRun;


    // Constructor
    constructor(string _name) public { name = _name; }


    // Task name
    function name() public returns (string) { return name; }


    // Run task
    function run(address _nodeAddress) public returns (bool) {
        timesRun[_nodeAddress] = timesRun[_nodeAddress] + 1;
    }


}
