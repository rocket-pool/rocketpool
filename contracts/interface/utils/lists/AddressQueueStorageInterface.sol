pragma solidity 0.4.24; 

contract AddressQueueStorageInterface {
	function capacity() public view returns (uint);
    function getQueueLength(bytes32 _key) public view returns (uint);
    function getQueueItem(bytes32 _key, uint _index) external view returns (address);
    function enqueueItem(bytes32 _key, address _value) external;
    function dequeueItem(bytes32 _key) external;
    function setCapacity(uint256 _value) external;
}
