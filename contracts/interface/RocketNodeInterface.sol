pragma solidity 0.5.0;

contract RocketNodeInterface {
    function getAvailableNodeCount(string memory _durationID) public returns (uint256);
    function getAvailableNodeCount(bool _trusted, string memory _durationID) public returns (uint256);
    function getRandomAvailableNode(bool _trusted, string memory _durationID, uint256 _seed, uint256 _offset) public returns (address);
}
