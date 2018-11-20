pragma solidity 0.5.0;

contract RocketNodeInterface {
	function getAvailableNodeCount(string memory _durationID) public returns (uint256);
    function getRandomAvailableNode(string memory _durationID, uint256 _nonce) public returns (address, bool);
    function setNodeAvailable(address _nodeOwner, bool _trusted, string memory _durationID) public;
    function setNodeUnavailable(address _nodeOwner, bool _trusted, string memory _durationID) public;
}
