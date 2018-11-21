pragma solidity 0.5.0;


import "../../../RocketBase.sol";


/// @title Uint set storage helper for RocketStorage data (contains unique items; has reverse index lookups)
/// @author Jake Pospischil
contract UintSetStorage is RocketBase {


    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != address(0x0), "Calls permitted from latest Rocket Pool network contracts only");
        _;
    }


    /// @dev RocketSetStorage constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev The number of items in a set
    function getCount(bytes32 _key) external view returns (uint) {
        return rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
    }


    /// @dev The item in a set by index
    function getItem(bytes32 _key, uint _index) external view returns (uint) {
        return rocketStorage.getUint(keccak256(abi.encodePacked(_key, "item", _index)));
    }


    /// @dev The index of an item in a set
    /// @dev Returns -1 if the value is not found
    function getIndexOf(bytes32 _key, uint _value) external view returns (int) {
        return int(rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value)))) - 1;
    }


    /// @dev Add an item to a set
    /// @dev Requires that the item does not exist in the set
    function addItem(bytes32 _key, uint _value) onlyLatestRocketNetworkContract external {
        require(rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value))) == 0, "Item already exists in set");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "item", count)), _value);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", _value)), count + 1);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count + 1);
    }


    /// @dev Remove an item from a set
    /// @dev Swaps the item with the last item in the set and truncates it; computationally cheap
    /// @dev Requires that the item exists in the set
    function removeItem(bytes32 _key, uint _value) onlyLatestRocketNetworkContract external {
        uint256 index = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "index", _value)));
        require(index-- > 0, "Item does not exist in set");
        uint count = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "count")));
        if (index < count - 1) {
            uint lastItem = rocketStorage.getUint(keccak256(abi.encodePacked(_key, "item", count - 1)));
            rocketStorage.setUint(keccak256(abi.encodePacked(_key, "item", index)), lastItem);
            rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", lastItem)), index + 1);
        }
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "index", _value)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked(_key, "count")), count - 1);
    }


}
