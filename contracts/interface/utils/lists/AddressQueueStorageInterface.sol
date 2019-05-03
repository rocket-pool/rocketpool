pragma solidity 0.5.8; 

contract AddressQueueStorageInterface {
	function capacity() public view returns (uint);
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (address);
    function getQueueIndexOf(bytes32 _key, address _value) external view returns (int);
    function enqueueItem(bytes32 _key, address _value) external;
    function dequeueItem(bytes32 _key) external;
    function removeItem(bytes32 _key, address _value) external;
    function setCapacity(uint256 _value) external;
}
