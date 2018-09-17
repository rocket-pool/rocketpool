pragma solidity 0.4.24;

contract RocketNodeTaskInterface {
    function before() public returns (bool);
    function after() public returns (bool);
}
