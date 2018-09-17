pragma solidity 0.4.24;

contract RocketNodeTaskInterface {
    function name() public returns (string);
    function run(address _nodeAddress) public returns (bool);
}
