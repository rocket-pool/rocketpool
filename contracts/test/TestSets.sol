pragma solidity 0.5.0;


import "../RocketBase.sol";
import "../interface/utils/lists/AddressSetStorageInterface.sol";
import "../interface/utils/lists/BoolSetStorageInterface.sol";
import "../interface/utils/lists/Bytes32SetStorageInterface.sol";
import "../interface/utils/lists/BytesSetStorageInterface.sol";
import "../interface/utils/lists/IntSetStorageInterface.sol";
import "../interface/utils/lists/StringSetStorageInterface.sol";
import "../interface/utils/lists/UintSetStorageInterface.sol";


contract TestSets is RocketBase {


    // Contracts
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);
    BoolSetStorageInterface boolSetStorage = BoolSetStorageInterface(0);
    Bytes32SetStorageInterface bytes32SetStorage = Bytes32SetStorageInterface(0);
    BytesSetStorageInterface bytesSetStorage = BytesSetStorageInterface(0);
    IntSetStorageInterface intSetStorage = IntSetStorageInterface(0);
    StringSetStorageInterface stringSetStorage = StringSetStorageInterface(0);
    UintSetStorageInterface uintSetStorage = UintSetStorageInterface(0);


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Initialise
    function init() external {

        // Initialise contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        boolSetStorage = BoolSetStorageInterface(getContractAddress("utilBoolSetStorage"));
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytesSetStorage = BytesSetStorageInterface(getContractAddress("utilBytesSetStorage"));
        intSetStorage = IntSetStorageInterface(getContractAddress("utilIntSetStorage"));
        stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        uintSetStorage = UintSetStorageInterface(getContractAddress("utilUintSetStorage"));

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


    // Bool set tests
    function bool_getCount(bytes32 _key) external view returns (uint) {
        return boolSetStorage.getCount(_key);
    }
    function bool_getItem(bytes32 _key, uint _index) external view returns (bool) {
        return boolSetStorage.getItem(_key, _index);
    }
    function bool_getIndexOf(bytes32 _key, bool _value) external view returns (int) {
        return boolSetStorage.getIndexOf(_key, _value);
    }
    function bool_addItem(bytes32 _key, bool _value) external {
        boolSetStorage.addItem(_key, _value);
    }
    function bool_removeItem(bytes32 _key, bool _value) external {
        boolSetStorage.removeItem(_key, _value);
    }


    // Bytes32 set tests
    function bytes32_getCount(bytes32 _key) external view returns (uint) {
        return bytes32SetStorage.getCount(_key);
    }
    function bytes32_getItem(bytes32 _key, uint _index) external view returns (bytes32) {
        return bytes32SetStorage.getItem(_key, _index);
    }
    function bytes32_getIndexOf(bytes32 _key, bytes32 _value) external view returns (int) {
        return bytes32SetStorage.getIndexOf(_key, _value);
    }
    function bytes32_addItem(bytes32 _key, bytes32 _value) external {
        bytes32SetStorage.addItem(_key, _value);
    }
    function bytes32_removeItem(bytes32 _key, bytes32 _value) external {
        bytes32SetStorage.removeItem(_key, _value);
    }


    // Bytes set tests
    function bytes_getCount(bytes32 _key) external view returns (uint) {
        return bytesSetStorage.getCount(_key);
    }
    function bytes_getItem(bytes32 _key, uint _index) external view returns (bytes memory) {
        return bytesSetStorage.getItem(_key, _index);
    }
    function bytes_getIndexOf(bytes32 _key, bytes memory _value) public view returns (int) {
        return bytesSetStorage.getIndexOf(_key, _value);
    }
    function bytes_addItem(bytes32 _key, bytes memory _value) public {
        bytesSetStorage.addItem(_key, _value);
    }
    function bytes_removeItem(bytes32 _key, bytes memory _value) public {
        bytesSetStorage.removeItem(_key, _value);
    }


    // Int set tests
    function int_getCount(bytes32 _key) external view returns (uint) {
        return intSetStorage.getCount(_key);
    }
    function int_getItem(bytes32 _key, uint _index) external view returns (int) {
        return intSetStorage.getItem(_key, _index);
    }
    function int_getIndexOf(bytes32 _key, int _value) external view returns (int) {
        return intSetStorage.getIndexOf(_key, _value);
    }
    function int_addItem(bytes32 _key, int _value) external {
        intSetStorage.addItem(_key, _value);
    }
    function int_removeItem(bytes32 _key, int _value) external {
        intSetStorage.removeItem(_key, _value);
    }


    // String set tests
    function string_getCount(bytes32 _key) external view returns (uint) {
        return stringSetStorage.getCount(_key);
    }
    function string_getItem(bytes32 _key, uint _index) external view returns (string memory) {
        return stringSetStorage.getItem(_key, _index);
    }
    function string_getIndexOf(bytes32 _key, string memory _value) public view returns (int) {
        return stringSetStorage.getIndexOf(_key, _value);
    }
    function string_addItem(bytes32 _key, string memory _value) public {
        stringSetStorage.addItem(_key, _value);
    }
    function string_removeItem(bytes32 _key, string memory _value) public {
        stringSetStorage.removeItem(_key, _value);
    }


    // Uint set tests
    function uint_getCount(bytes32 _key) external view returns (uint) {
        return uintSetStorage.getCount(_key);
    }
    function uint_getItem(bytes32 _key, uint _index) external view returns (uint) {
        return uintSetStorage.getItem(_key, _index);
    }
    function uint_getIndexOf(bytes32 _key, uint _value) external view returns (int) {
        return uintSetStorage.getIndexOf(_key, _value);
    }
    function uint_addItem(bytes32 _key, uint _value) external {
        uintSetStorage.addItem(_key, _value);
    }
    function uint_removeItem(bytes32 _key, uint _value) external {
        uintSetStorage.removeItem(_key, _value);
    }


}
