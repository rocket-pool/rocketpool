pragma solidity 0.4.24;

contract RocketNodeInterface {
    function getAvailableNodeCount(string _durationID) public returns (uint256);
    function getAvailableNodeCount(bool _trusted, string _durationID) public returns (uint256);
    function getRandomAvailableNode(bool _trusted, string _durationID, uint256 _seed, uint256 _offset) public returns (address);
    function setNodeAvailable(address _nodeOwner, bool _trusted, string _durationID) public;
    function setNodeUnavailable(address _nodeOwner, bool _trusted, string _durationID) public;
}
