pragma solidity 0.4.24;

contract RocketNodeTaskInterface {
    function before(address _nodeAddress) public returns (bool);
    function after(address _nodeAddress) public returns (bool);
}
