pragma solidity 0.4.24;


import "../../../RocketBase.sol";


/// @title Address list storage helper for RocketStorage data
/// @author Jake Pospischil
contract BytesListStorage is RocketBase {


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != 0x0, "Calls permitted from latest Rocket Pool network contracts only");
        _;
    }


    /// @dev RocketListStorage constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {

        // Set version
        version = 1;

    }


    /// @dev The number of items in a byte array list
    function getListCount(bytes32 _key) external view returns (uint) {
        return rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
    }


    /// @dev The item in a byte array list by index
    function getListItem(bytes32 _key, uint _index) external view returns (bytes) {
        return rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", _index)));
    }


    /// @dev The index of the first byte array list item found matching the value
    /// @dev Walks list until the item is found; computationally expensive
    /// @dev Returns -1 if the value is not found
    function getListIndexOf(bytes32 _key, bytes _value) external view returns (int) {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = 0; index < count; ++index) {
            if (keccak256(rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", index)))) == keccak256(_value)) {
                return int(index);
            }
        }
        return -1;
    }


    /// @dev Set the item in a byte array list by index
    /// @dev Overrides any existing data at the index; other list elements and count are not modified
    /// @dev Requires that the index is within the list's bounds
    function setListItem(bytes32 _key, uint _index, bytes _value) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", _index)), _value);
    }


    /// @dev Push an item onto a byte array list
    /// @dev Increments list count
    function pushListItem(bytes32 _key, bytes _value) onlyLatestRocketNetworkContract external {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", count)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Insert an item into a byte array list at index
    /// @dev Moves all items at _index and after and increments list count; computationally expensive
    /// @dev Requires that the index is no higher than the current list length
    function insertListItem(bytes32 _key, uint _index, bytes _value) onlyLatestRocketNetworkContract external {
        require(_index <= rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = count; index > _index; --index) {
            bytes memory previousItem = rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", index - 1)));
            rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", index)), previousItem);
        }
        rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", _index)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Remove an item from an unordered byte array list at index
    /// @dev Swaps the item at _index with the last item in the list and truncates it; computationally cheap
    /// @dev Requires that the index is within the lists's bounds
    function removeUnorderedListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        if (_index < count - 1) {
            bytes memory lastItem = rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", count - 1)));
            rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", _index)), lastItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


    /// @dev Remove an item from an ordered byte array list at index
    /// @dev Moves all items after _index and truncates the list; computationally expensive
    /// @dev Requires that the index is within the lists's bounds
    function removeOrderedListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = _index; index < count - 1; ++index) {
            bytes memory nextItem = rocketStorage.getBytes(keccak256(abi.encodePacked(_key, "item", index + 1)));
            rocketStorage.setBytes(keccak256(abi.encodePacked(_key, "item", index)), nextItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


}
