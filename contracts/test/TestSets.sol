pragma solidity 0.4.24;


import "../RocketBase.sol";
import "../interface/utils/lists/AddressSetStorageInterface.sol";


contract TestSets is RocketBase {


    // Contracts
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Initialise
    function init() external {

        // Initialise contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

    }


    // Address set tests
    function address_getCount(bytes32 _key) external view returns (uint) {
        return addressSetStorage.getCount(_key);
    }
    function address_getItem(bytes32 _key, uint _index) external view returns (address) {
        return addressSetStorage.getItem(_key, _index);
    }
    function address_getIndexOf(bytes32 _key, address _value) external view returns (int) {
        return addressSetStorage.getIndexOf(_key, _value);
    }
    function address_addItem(bytes32 _key, address _value) external {
        addressSetStorage.addItem(_key, _value);
    }
    function address_removeItem(bytes32 _key, address _value) external {
        addressSetStorage.removeItem(_key, _value);
    }


}
