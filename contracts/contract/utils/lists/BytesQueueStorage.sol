pragma solidity 0.5.0;


import "../../../RocketBase.sol";
import "../../../lib/SafeMath.sol";


/// @title Bytes queue storage helper for RocketStorage data (ring buffer implementation)
/// @author Jake Pospischil
contract BytesQueueStorage is RocketBase {


    /// Libs
    using SafeMath for uint256;


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != address(0x0), "Calls permitted from latest Rocket Pool network contracts only");
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
    function getQueueItem(bytes32 _key, uint _index) external view returns (bytes memory) {
        uint index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start"))).add(_index);
        if (index >= capacity) { index = index.sub(capacity); }
        return rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", index)));
    }


    /// @dev The index of an item in a bytes queue
    /// @dev Returns -1 if the value is not found
    function getQueueIndexOf(bytes32 _key, bytes memory _value) public view returns (int) {
        int index = int(rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value)))) - 1;
        if (index != -1) {
            index -= int(rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start"))));
            if (index < 0) { index += int(capacity); }
        }
        return index;
    }


    /// @dev Add an item to the end of a bytes queue
    /// @dev Requires that the queue is not at capacity
    /// @dev Requires that the item does not exist in the queue
    function enqueueItem(bytes32 _key, bytes memory _value) onlyLatestRocketNetworkContract public {
        require(getQueueLength(_key) < capacity - 1, "Queue is at capacity");
        require(rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value))) == 0, "Item already exists in queue");
        uint index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "end")));
        rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", index)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", _value)), index + 1);
        index = index.add(1);
        if (index >= capacity) { index = index.sub(capacity); }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "end")), index);
    }


    /// @dev Remove an item from the start of a bytes queue
    /// @dev Requires that the queue is not empty
    function dequeueItem(bytes32 _key) onlyLatestRocketNetworkContract external {
        require(getQueueLength(_key) > 0, "Queue is empty");
        uint start = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "start")));
        bytes memory item = rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", start)));
        start = start.add(1);
        if (start >= capacity) { start = start.sub(capacity); }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", item)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "start")), start);
    }


    /// @dev Remove an item from a bytes queue
    /// @dev Swaps the item with the last item in the queue and truncates it; computationally cheap
    /// @dev Requires that the item exists in the queue
    function removeItem(bytes32 _key, bytes memory _value) onlyLatestRocketNetworkContract public {
        uint index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value)));
        require(index-- > 0, "Item does not exist in queue");
        uint lastIndex = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "end")));
        if (lastIndex == 0) lastIndex = capacity;
        lastIndex = lastIndex.sub(1);
        if (index != lastIndex) {
            bytes memory lastItem = rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", lastIndex)));
            rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", index)), lastItem);
            rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", lastItem)), index + 1);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", _value)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "end")), lastIndex);
    }


    /// @dev Set storage capacity
    /// @dev Accessible by test interface contracts only - capacity remains constant in production
    function setCapacity(uint256 _value) onlyLatestContract("testQueues", msg.sender) external {
        capacity = _value;
    }


}

