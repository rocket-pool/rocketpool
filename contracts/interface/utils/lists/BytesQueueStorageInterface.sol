pragma solidity 0.4.24; 

contract BytesQueueStorageInterface {
    function getQueueLength(bytes32 _key) external view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes);
    function enqueueItem(bytes32 _key, bytes _value) external;
    function dequeueItem(bytes32 _key) external;
}
