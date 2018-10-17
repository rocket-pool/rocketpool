pragma solidity 0.4.24; 

contract BytesQueueStorageInterface {
	function capacity() public view returns (uint);
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes);
    function getQueueIndexOf(bytes32 _key, bytes _value) external view returns (int);
    function enqueueItem(bytes32 _key, bytes _value) external;
    function dequeueItem(bytes32 _key) external;
    function removeItem(bytes32 _key, bytes _value) external;
    function setCapacity(uint256 _value) external;
}
