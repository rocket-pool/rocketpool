pragma solidity 0.4.24;

contract RocketNodeTaskInterface {
    function beforeCheckin(address _nodeAddress) public returns (bool);
    function afterCheckin(address _nodeAddress) public returns (bool);
}
