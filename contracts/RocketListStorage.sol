pragma solidity 0.4.24;


import "./RocketBase.sol";


/// @title List storage helper for RocketStorage data
/// @author Jake Pospischil
contract RocketListStorage is RocketBase {


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        //require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != 0x0, "Calls permitted from latest Rocket Pool network contracts only");
        _;
    }


    /// @dev RocketListStorage constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {

        // Set version
        version = 1;

    }


    //
    // Addresses
    //


    /// @dev The number of items in an address list
    function getAddressListCount(bytes32 _key) external view returns (uint) {
        return rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
    }


    /// @dev The item in an address list by index
    function getAddressListItem(bytes32 _key, uint _index) external view returns (address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked(_key, "item", _index)));
    }


    /// @dev The index of the first address list item found matching the value
    /// @dev Walks list until the item is found; computationally expensive
    /// @dev Returns -1 if the value is not found
    function getAddressListIndexOf(bytes32 _key, address _value) external view returns (int) {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = 0; index < count; ++index) {
            if (rocketStorage.getAddress(keccak256(abi.encodePacked(_key, "item", index))) == _value) {
                return int(index);
            }
        }
        return -1;
    }


    /// @dev Set the item in an address list by index
    /// @dev Overrides any existing data at the index; other list elements and count are not modified
    /// @dev Requires that the index is within the list's bounds
    function setAddressListItem(bytes32 _key, uint _index, address _value) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", _index)), _value);
    }


    /// @dev Push an item onto an address list
    /// @dev Increments list count
    function pushAddressListItem(bytes32 _key, address _value) onlyLatestRocketNetworkContract external {
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", count)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Insert an item into an address list at index
    /// @dev Moves all items at _index and after and increments list count; computationally expensive
    /// @dev Requires that the index is no higher than the current list length
    function insertAddressListItem(bytes32 _key, uint _index, address _value) onlyLatestRocketNetworkContract external {
        require(_index <= rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = count; index > _index + 1; --index) {
            address previousItem = rocketStorage.getAddress(keccak256(abi.encodePacked(_key, "item", index - 1)));
            rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", index)), previousItem);
        }
        rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", _index)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Remove an item from an unordered address list at index
    /// @dev Swaps the item at _index with the last item in the list and truncates it; computationally cheap
    /// @dev Requires that the index is within the lists's bounds
    function removeUAddressListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        if (_index < count - 1) {
            address lastItem = rocketStorage.getAddress(keccak256(abi.encodePacked(_key, "item", count - 1)));
            rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", _index)), lastItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


    /// @dev Remove an item from an ordered address list at index
    /// @dev Moves all items after _index and truncates the list; computationally expensive
    /// @dev Requires that the index is within the lists's bounds
    function removeOAddressListItem(bytes32 _key, uint _index) onlyLatestRocketNetworkContract external {
        require(_index < rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count"))), "List index out of bounds");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        for (uint index = _index; index < count - 1; ++index) {
            address nextItem = rocketStorage.getAddress(keccak256(abi.encodePacked(_key, "item", index + 1)));
            rocketStorage.setAddress(keccak256(abi.encodePacked(_key, "item", index)), nextItem);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


}
