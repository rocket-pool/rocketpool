pragma solidity 0.4.24;


import "../../../RocketBase.sol";
import "../../../lib/SafeMath.sol";


/// @title Bytes queue storage helper for RocketStorage data (ring buffer implementation)
/// @author Jake Pospischil
contract BytesQueueStorage is RocketBase {


    /// Libs
    using SafeMath for uint256;


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != 0x0, "Calls permitted from latest Rocket Pool network contracts only");
        _;
    }


    /// Settings
    uint256 public capacity = 2 ** 255; // max uint256 / 2


    /// @dev RocketQueueStorage constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev The number of items in a bytes queue
    function getQueueLength(bytes32 _key) public view returns (uint) {
        uint start = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start")));
        uint end = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "end")));
        if (end < start) { end = end.add(capacity); }
        return end.sub(start);
    }


    /// @dev The item in a bytes queue by index
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes) {
        uint index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start"))).add(_index);
        if (index >= capacity) { index = index.sub(capacity); }
        return rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", index)));
    }


    /// @dev Add an item to the end of a bytes queue
    /// @dev Requires that the queue is not at capacity
    function enqueueItem(bytes32 _key, bytes _value) onlyLatestRocketNetworkContract external {
        require(getQueueLength(_key) < capacity - 1, "Queue is at capacity");
        uint index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "end")));
        rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", index)), _value);
        index = index.add(1);
        if (index >= capacity) { index = index.sub(capacity); }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "end")), index);
    }


    /// @dev Remove an item from the start of a bytes queue
    /// @dev Requires that the queue is not empty
    function dequeueItem(bytes32 _key) onlyLatestRocketNetworkContract external {
        require(getQueueLength(_key) > 0, "Queue is empty");
        uint start = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start"))).add(1);
        if (start >= capacity) { start = start.sub(capacity); }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "start")), start);
    }


    /// @dev Set storage capacity
    /// @dev Accessible by test interface contracts only - capacity remains constant in production
    function setCapacity(uint256 _value) onlyLatestContract("testQueues", msg.sender) external {
        capacity = _value;
    }


}

