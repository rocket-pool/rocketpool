pragma solidity 0.5.0;

contract RocketNodeTasksInterface {
    function run(address _nodeAddress) external;
    function runOne(address _nodeAddress, address _taskAddress) external;
}
