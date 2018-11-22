pragma solidity 0.5.0; 

contract BytesQueueStorageInterface {
	function capacity() public view returns (uint);
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes memory);
    function getQueueIndexOf(bytes32 _key, bytes memory _value) public view returns (int);
    function enqueueItem(bytes32 _key, bytes memory _value) public;
    function dequeueItem(bytes32 _key) external;
    function removeItem(bytes32 _key, bytes memory _value) public;
    function setCapacity(uint256 _value) external;
}
