pragma solidity 0.4.24;

contract RocketNodeInterface {
	function getAvailableNodeCount(string _durationID) public returns (uint256);
    function getRandomAvailableNode(string _durationID, uint256 _nonce) public returns (address, bool);
    function setNodeAvailable(address _nodeOwner, bool _trusted, string _durationID) public;
    function setNodeUnavailable(address _nodeOwner, bool _trusted, string _durationID) public;
}
