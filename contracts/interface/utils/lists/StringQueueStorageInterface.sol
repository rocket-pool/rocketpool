pragma solidity 0.5.8; 

contract StringQueueStorageInterface {
	function capacity() public view returns (uint);
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (string memory);
    function getQueueIndexOf(bytes32 _key, string memory _value) public view returns (int);
    function enqueueItem(bytes32 _key, string memory _value) public;
    function dequeueItem(bytes32 _key) external;
    function removeItem(bytes32 _key, string memory _value) public;
    function setCapacity(uint256 _value) external;
}
