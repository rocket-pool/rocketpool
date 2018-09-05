pragma solidity 0.4.24; 

contract Bytes32QueueStorageInterface {
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes32);
    function enqueueItem(bytes32 _key, bytes32 _value) external;
    function dequeueItem(bytes32 _key) external;
}
