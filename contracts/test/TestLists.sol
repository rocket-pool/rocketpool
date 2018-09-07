pragma solidity 0.4.24;


import "../RocketBase.sol";
import "../interface/utils/lists/AddressListStorageInterface.sol";
import "../interface/utils/lists/BoolListStorageInterface.sol";
import "../interface/utils/lists/Bytes32ListStorageInterface.sol";
import "../interface/utils/lists/BytesListStorageInterface.sol";
import "../interface/utils/lists/IntListStorageInterface.sol";
import "../interface/utils/lists/StringListStorageInterface.sol";
import "../interface/utils/lists/UintListStorageInterface.sol";


contract TestLists is RocketBase {


    // Contracts
    AddressListStorageInterface addressListStorage = AddressListStorageInterface(0);
    BoolListStorageInterface boolListStorage = BoolListStorageInterface(0);
    Bytes32ListStorageInterface bytes32ListStorage = Bytes32ListStorageInterface(0);
    BytesListStorageInterface bytesListStorage = BytesListStorageInterface(0);
    IntListStorageInterface intListStorage = IntListStorageInterface(0);
    StringListStorageInterface stringListStorage = StringListStorageInterface(0);
    UintListStorageInterface uintListStorage = UintListStorageInterface(0);


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Initialise
    function init() external {
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        boolListStorage = BoolListStorageInterface(getContractAddress("utilBoolListStorage"));
        bytes32ListStorage = Bytes32ListStorageInterface(getContractAddress("utilBytes32ListStorage"));
        bytesListStorage = BytesListStorageInterface(getContractAddress("utilBytesListStorage"));
        intListStorage = IntListStorageInterface(getContractAddress("utilIntListStorage"));
        stringListStorage = StringListStorageInterface(getContractAddress("utilStringListStorage"));
        uintListStorage = UintListStorageInterface(getContractAddress("utilUintListStorage"));
    }


    // Address list tests
    function address_getListCount(bytes32 _key) external view returns (uint) {
        return addressListStorage.getListCount(_key);
    }
    function address_getListItem(bytes32 _key, uint _index) external view returns (address) {
        return addressListStorage.getListItem(_key, _index);
    }
    function address_getListIndexOf(bytes32 _key, address _value) external view returns (int) {
        return addressListStorage.getListIndexOf(_key, _value);
    }
    function address_setListItem(bytes32 _key, uint _index, address _value) external {
        addressListStorage.setListItem(_key, _index, _value);
    }
    function address_pushListItem(bytes32 _key, address _value) external {
        addressListStorage.pushListItem(_key, _value);
    }
    function address_insertListItem(bytes32 _key, uint _index, address _value) external {
        addressListStorage.insertListItem(_key, _index, _value);
    }
    function address_removeUnorderedListItem(bytes32 _key, uint _index) external {
        addressListStorage.removeUnorderedListItem(_key, _index);
    }
    function address_removeOrderedListItem(bytes32 _key, uint _index) external {
        addressListStorage.removeOrderedListItem(_key, _index);
    }


    // Bool list tests
    function bool_getListCount(bytes32 _key) external view returns (uint) {
        return boolListStorage.getListCount(_key);
    }
    function bool_getListItem(bytes32 _key, uint _index) external view returns (bool) {
        return boolListStorage.getListItem(_key, _index);
    }
    function bool_getListIndexOf(bytes32 _key, bool _value) external view returns (int) {
        return boolListStorage.getListIndexOf(_key, _value);
    }
    function bool_setListItem(bytes32 _key, uint _index, bool _value) external {
        boolListStorage.setListItem(_key, _index, _value);
    }
    function bool_pushListItem(bytes32 _key, bool _value) external {
        boolListStorage.pushListItem(_key, _value);
    }
    function bool_insertListItem(bytes32 _key, uint _index, bool _value) external {
        boolListStorage.insertListItem(_key, _index, _value);
    }
    function bool_removeUnorderedListItem(bytes32 _key, uint _index) external {
        boolListStorage.removeUnorderedListItem(_key, _index);
    }
    function bool_removeOrderedListItem(bytes32 _key, uint _index) external {
        boolListStorage.removeOrderedListItem(_key, _index);
    }


    // Bytes32 list tests
    function bytes32_getListCount(bytes32 _key) external view returns (uint) {
        return bytes32ListStorage.getListCount(_key);
    }
    function bytes32_getListItem(bytes32 _key, uint _index) external view returns (bytes32) {
        return bytes32ListStorage.getListItem(_key, _index);
    }
    function bytes32_getListIndexOf(bytes32 _key, bytes32 _value) external view returns (int) {
        return bytes32ListStorage.getListIndexOf(_key, _value);
    }
    function bytes32_setListItem(bytes32 _key, uint _index, bytes32 _value) external {
        bytes32ListStorage.setListItem(_key, _index, _value);
    }
    function bytes32_pushListItem(bytes32 _key, bytes32 _value) external {
        bytes32ListStorage.pushListItem(_key, _value);
    }
    function bytes32_insertListItem(bytes32 _key, uint _index, bytes32 _value) external {
        bytes32ListStorage.insertListItem(_key, _index, _value);
    }
    function bytes32_removeUnorderedListItem(bytes32 _key, uint _index) external {
        bytes32ListStorage.removeUnorderedListItem(_key, _index);
    }
    function bytes32_removeOrderedListItem(bytes32 _key, uint _index) external {
        bytes32ListStorage.removeOrderedListItem(_key, _index);
    }


    // Bytes list tests
    function bytes_getListCount(bytes32 _key) external view returns (uint) {
        return bytesListStorage.getListCount(_key);
    }
    function bytes_getListItem(bytes32 _key, uint _index) external view returns (bytes) {
        return bytesListStorage.getListItem(_key, _index);
    }
    function bytes_getListIndexOf(bytes32 _key, bytes _value) external view returns (int) {
        return bytesListStorage.getListIndexOf(_key, _value);
    }
    function bytes_setListItem(bytes32 _key, uint _index, bytes _value) external {
        bytesListStorage.setListItem(_key, _index, _value);
    }
    function bytes_pushListItem(bytes32 _key, bytes _value) external {
        bytesListStorage.pushListItem(_key, _value);
    }
    function bytes_insertListItem(bytes32 _key, uint _index, bytes _value) external {
        bytesListStorage.insertListItem(_key, _index, _value);
    }
    function bytes_removeUnorderedListItem(bytes32 _key, uint _index) external {
        bytesListStorage.removeUnorderedListItem(_key, _index);
    }
    function bytes_removeOrderedListItem(bytes32 _key, uint _index) external {
        bytesListStorage.removeOrderedListItem(_key, _index);
    }


    // Int list tests
    function int_getListCount(bytes32 _key) external view returns (uint) {
        return intListStorage.getListCount(_key);
    }
    function int_getListItem(bytes32 _key, uint _index) external view returns (int) {
        return intListStorage.getListItem(_key, _index);
    }
    function int_getListIndexOf(bytes32 _key, int _value) external view returns (int) {
        return intListStorage.getListIndexOf(_key, _value);
    }
    function int_setListItem(bytes32 _key, uint _index, int _value) external {
        intListStorage.setListItem(_key, _index, _value);
    }
    function int_pushListItem(bytes32 _key, int _value) external {
        intListStorage.pushListItem(_key, _value);
    }
    function int_insertListItem(bytes32 _key, uint _index, int _value) external {
        intListStorage.insertListItem(_key, _index, _value);
    }
    function int_removeUnorderedListItem(bytes32 _key, uint _index) external {
        intListStorage.removeUnorderedListItem(_key, _index);
    }
    function int_removeOrderedListItem(bytes32 _key, uint _index) external {
        intListStorage.removeOrderedListItem(_key, _index);
    }


    // String list tests
    function string_getListCount(bytes32 _key) external view returns (uint) {
        return stringListStorage.getListCount(_key);
    }
    function string_getListItem(bytes32 _key, uint _index) external view returns (string) {
        return stringListStorage.getListItem(_key, _index);
    }
    function string_getListIndexOf(bytes32 _key, string _value) external view returns (int) {
        return stringListStorage.getListIndexOf(_key, _value);
    }
    function string_setListItem(bytes32 _key, uint _index, string _value) external {
        stringListStorage.setListItem(_key, _index, _value);
    }
    function string_pushListItem(bytes32 _key, string _value) external {
        stringListStorage.pushListItem(_key, _value);
    }
    function string_insertListItem(bytes32 _key, uint _index, string _value) external {
        stringListStorage.insertListItem(_key, _index, _value);
    }
    function string_removeUnorderedListItem(bytes32 _key, uint _index) external {
        stringListStorage.removeUnorderedListItem(_key, _index);
    }
    function string_removeOrderedListItem(bytes32 _key, uint _index) external {
        stringListStorage.removeOrderedListItem(_key, _index);
    }


    // Uint list tests
    function uint_getListCount(bytes32 _key) external view returns (uint) {
        return uintListStorage.getListCount(_key);
    }
    function uint_getListItem(bytes32 _key, uint _index) external view returns (uint) {
        return uintListStorage.getListItem(_key, _index);
    }
    function uint_getListIndexOf(bytes32 _key, uint _value) external view returns (int) {
        return uintListStorage.getListIndexOf(_key, _value);
    }
    function uint_setListItem(bytes32 _key, uint _index, uint _value) external {
        uintListStorage.setListItem(_key, _index, _value);
    }
    function uint_pushListItem(bytes32 _key, uint _value) external {
        uintListStorage.pushListItem(_key, _value);
    }
    function uint_insertListItem(bytes32 _key, uint _index, uint _value) external {
        uintListStorage.insertListItem(_key, _index, _value);
    }
    function uint_removeUnorderedListItem(bytes32 _key, uint _index) external {
        uintListStorage.removeUnorderedListItem(_key, _index);
    }
    function uint_removeOrderedListItem(bytes32 _key, uint _index) external {
        uintListStorage.removeOrderedListItem(_key, _index);
    }


}
