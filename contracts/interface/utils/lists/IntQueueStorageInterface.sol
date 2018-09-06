pragma solidity 0.4.24; 

contract IntQueueStorageInterface {
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (int);
    function enqueueItem(bytes32 _key, int _value) external;
    function dequeueItem(bytes32 _key) external;
}