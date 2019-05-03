pragma solidity 0.5.8;


import "../../../RocketBase.sol";


/// @title Bytes32 list storage helper for RocketStorage data
/// @author Jake Pospischil
contract Bytes32ListStorage is RocketBase {


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != address(0x0), "Calls permitted from latest Rocket Pool network contracts only");
        _;
    }


    /// @dev RocketListStorage constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev The number of items in a bytes32 list
    function getListCount(bytes32 _key) external view returns (uint) {
        return rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
    }


    /// @dev The item in a bytes32 list by index
    function getListItem(bytes32 _key, uint _index) external view returns (bytes32) {
        return rocketStorage.getBytes32(keccak256(abi.encodePacked(_key, "item", _index)));
    }


    /// @dev The index of the first bytes32 list item found matching the value
    /// @dev Walks list until the item is found; computationally expensive
    /// @dev Returns -1 if the value is not found
    function getListIndexOf(bytes32 _key, bytes32 _value) external view returns (int) {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = 0; index < count; ++index) {
            if (rocketStorage.getBytes32(keccak256(abi.encodePacked(_key, "item", index))) == _value) {
                return int(index);
            }
        }
        return -1;
    }


    /// @dev Set the item in a bytes32 list by index
    /// @dev Overrides any existing data at the index; other list elements and count are not modified
    /// @dev Requires that the index is within the list's bounds
    function setListItem(bytes32 _key, uint _index, bytes32 _value) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", _index)), _value);
    }


    /// @dev Push an item onto a bytes32 list
    /// @dev Increments list count
    function pushListItem(bytes32 _key, bytes32 _value) onlyLatestRocketNetworkContract external {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", count)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Insert an item into a bytes32 list at index
    /// @dev Moves all items at _index and after and increments list count; computationally expensive
    /// @dev Requires that the index is no higher than the current list length
    function insertListItem(bytes32 _key, uint _index, bytes32 _value) onlyLatestRocketNetworkContract external {
        require(_index <= rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = count; index > _index; --index) {
            bytes32 previousItem = rocketStorage.getBytes32(keccak256(abi.encodePacked(_key, "item", index - 1)));
            rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", index)), previousItem);
        }
        rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", _index)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Remove an item from an unordered bytes32 list at index
    /// @dev Swaps the item at _index with the last item in the list and truncates it; computationally cheap
    /// @dev Requires that the index is within the lists's bounds
    function removeUnorderedListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        if (_index < count - 1) {
            bytes32 lastItem = rocketStorage.getBytes32(keccak256(abi.encodePacked(_key, "item", count - 1)));
            rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", _index)), lastItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


    /// @dev Remove an item from an ordered bytes32 list at index
    /// @dev Moves all items after _index and truncates the list; computationally expensive
    /// @dev Requires that the index is within the lists's bounds
    function removeOrderedListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = _index; index < count - 1; ++index) {
            bytes32 nextItem = rocketStorage.getBytes32(keccak256(abi.encodePacked(_key, "item", index + 1)));
            rocketStorage.setBytes32(keccak256(abi.encodePacked(_key, "item", index)), nextItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


}
