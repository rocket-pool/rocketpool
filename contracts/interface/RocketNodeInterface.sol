pragma solidity 0.4.24;

contract RocketNodeInterface {
	function getAvailableNodeCount() public returns (uint256);
    function getRandomAvailableNode(uint256 _nonce) public returns (address, bool);
    function setNodeAvailable(address _nodeOwner, bool _trusted) public;
    function setNodeUnavailable(address _nodeOwner, bool _trusted) public;
}
