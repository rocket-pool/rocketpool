pragma solidity 0.5.8;

contract RocketNodeTaskInterface {
    function name() public view returns (string memory);
    function run(address _nodeAddress) public returns (bool);
}
