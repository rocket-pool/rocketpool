pragma solidity 0.4.24;


import "../RocketBase.sol";
import "../interface/utils/lists/AddressQueueStorageInterface.sol";
import "../interface/utils/lists/BoolQueueStorageInterface.sol";
import "../interface/utils/lists/Bytes32QueueStorageInterface.sol";
import "../interface/utils/lists/BytesQueueStorageInterface.sol";
import "../interface/utils/lists/IntQueueStorageInterface.sol";
import "../interface/utils/lists/StringQueueStorageInterface.sol";
import "../interface/utils/lists/UintQueueStorageInterface.sol";


contract TestQueues is RocketBase {


    // Contracts
    AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(0);
    BoolQueueStorageInterface boolQueueStorage = BoolQueueStorageInterface(0);
    Bytes32QueueStorageInterface bytes32QueueStorage = Bytes32QueueStorageInterface(0);
    BytesQueueStorageInterface bytesQueueStorage = BytesQueueStorageInterface(0);
    IntQueueStorageInterface intQueueStorage = IntQueueStorageInterface(0);
    StringQueueStorageInterface stringQueueStorage = StringQueueStorageInterface(0);
    UintQueueStorageInterface uintQueueStorage = UintQueueStorageInterface(0);


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Initialise
    function init() external {

        // Initialise contracts
        addressQueueStorage = AddressQueueStorageInterface(getContractAddress("utilAddressQueueStorage"));
        boolQueueStorage = BoolQueueStorageInterface(getContractAddress("utilBoolQueueStorage"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));
        bytesQueueStorage = BytesQueueStorageInterface(getContractAddress("utilBytesQueueStorage"));
        intQueueStorage = IntQueueStorageInterface(getContractAddress("utilIntQueueStorage"));
        stringQueueStorage = StringQueueStorageInterface(getContractAddress("utilStringQueueStorage"));
        uintQueueStorage = UintQueueStorageInterface(getContractAddress("utilUintQueueStorage"));

        // Set capacity
        addressQueueStorage.setCapacity(4);
        boolQueueStorage.setCapacity(4);
        bytes32QueueStorage.setCapacity(4);
        bytesQueueStorage.setCapacity(4);
        intQueueStorage.setCapacity(4);
        stringQueueStorage.setCapacity(4);
        uintQueueStorage.setCapacity(4);

    }


    // Address queue tests
    function address_capacity() public view returns (uint) {
        return addressQueueStorage.capacity();
    }
    function address_getQueueLength(bytes32 _key) public view returns (uint) {
        return addressQueueStorage.getQueueLength(_key);
    }
    function address_getQueueItem(bytes32 _key, uint _index) external view returns (address) {
        return addressQueueStorage.getQueueItem(_key, _index);
    }
    function address_getQueueIndexOf(bytes32 _key, address _value) external view returns (int) {
        return addressQueueStorage.getQueueIndexOf(_key, _value);
    }
    function address_enqueueItem(bytes32 _key, address _value) external {
        addressQueueStorage.enqueueItem(_key, _value);
    }
    function address_dequeueItem(bytes32 _key) external {
        addressQueueStorage.dequeueItem(_key);
    }
    function address_removeItem(bytes32 _key, address _value) external {
        addressQueueStorage.removeItem(_key, _value);
    }


    // Bool queue tests
    function bool_capacity() public view returns (uint) {
        return boolQueueStorage.capacity();
    }
    function bool_getQueueLength(bytes32 _key) public view returns (uint) {
        return boolQueueStorage.getQueueLength(_key);
    }
    function bool_getQueueItem(bytes32 _key, uint _index) external view returns (bool) {
        return boolQueueStorage.getQueueItem(_key, _index);
    }
    function bool_getQueueIndexOf(bytes32 _key, bool _value) external view returns (int) {
        return boolQueueStorage.getQueueIndexOf(_key, _value);
    }
    function bool_enqueueItem(bytes32 _key, bool _value) external {
        boolQueueStorage.enqueueItem(_key, _value);
    }
    function bool_dequeueItem(bytes32 _key) external {
        boolQueueStorage.dequeueItem(_key);
    }
    function bool_removeItem(bytes32 _key, bool _value) external {
        boolQueueStorage.removeItem(_key, _value);
    }



    // Bytes32 queue tests
    function bytes32_capacity() public view returns (uint) {
        return bytes32QueueStorage.capacity();
    }
    function bytes32_getQueueLength(bytes32 _key) public view returns (uint) {
        return bytes32QueueStorage.getQueueLength(_key);
    }
    function bytes32_getQueueItem(bytes32 _key, uint _index) external view returns (bytes32) {
        return bytes32QueueStorage.getQueueItem(_key, _index);
    }
    function bytes32_getQueueIndexOf(bytes32 _key, bytes32 _value) external view returns (int) {
        return bytes32QueueStorage.getQueueIndexOf(_key, _value);
    }
    function bytes32_enqueueItem(bytes32 _key, bytes32 _value) external {
        bytes32QueueStorage.enqueueItem(_key, _value);
    }
    function bytes32_dequeueItem(bytes32 _key) external {
        bytes32QueueStorage.dequeueItem(_key);
    }
    function bytes32_removeItem(bytes32 _key, bytes32 _value) external {
        bytes32QueueStorage.removeItem(_key, _value);
    }


    // Bytes queue tests
    function bytes_capacity() public view returns (uint) {
        return bytesQueueStorage.capacity();
    }
    function bytes_getQueueLength(bytes32 _key) public view returns (uint) {
        return bytesQueueStorage.getQueueLength(_key);
    }
    function bytes_getQueueItem(bytes32 _key, uint _index) external view returns (bytes) {
        return bytesQueueStorage.getQueueItem(_key, _index);
    }
    function bytes_getQueueIndexOf(bytes32 _key, bytes _value) external view returns (int) {
        return bytesQueueStorage.getQueueIndexOf(_key, _value);
    }
    function bytes_enqueueItem(bytes32 _key, bytes _value) external {
        bytesQueueStorage.enqueueItem(_key, _value);
    }
    function bytes_dequeueItem(bytes32 _key) external {
        bytesQueueStorage.dequeueItem(_key);
    }
    function bytes_removeItem(bytes32 _key, bytes _value) external {
        bytesQueueStorage.removeItem(_key, _value);
    }


    // Int queue tests
    function int_capacity() public view returns (uint) {
        return intQueueStorage.capacity();
    }
    function int_getQueueLength(bytes32 _key) public view returns (uint) {
        return intQueueStorage.getQueueLength(_key);
    }
    function int_getQueueItem(bytes32 _key, uint _index) external view returns (int) {
        return intQueueStorage.getQueueItem(_key, _index);
    }
    function int_getQueueIndexOf(bytes32 _key, int _value) external view returns (int) {
        return intQueueStorage.getQueueIndexOf(_key, _value);
    }
    function int_enqueueItem(bytes32 _key, int _value) external {
        intQueueStorage.enqueueItem(_key, _value);
    }
    function int_dequeueItem(bytes32 _key) external {
        intQueueStorage.dequeueItem(_key);
    }
    function int_removeItem(bytes32 _key, int _value) external {
        intQueueStorage.removeItem(_key, _value);
    }


    // String queue tests
    function string_capacity() public view returns (uint) {
        return stringQueueStorage.capacity();
    }
    function string_getQueueLength(bytes32 _key) public view returns (uint) {
        return stringQueueStorage.getQueueLength(_key);
    }
    function string_getQueueItem(bytes32 _key, uint _index) external view returns (string) {
        return stringQueueStorage.getQueueItem(_key, _index);
    }
    function string_getQueueIndexOf(bytes32 _key, string _value) external view returns (int) {
        return stringQueueStorage.getQueueIndexOf(_key, _value);
    }
    function string_enqueueItem(bytes32 _key, string _value) external {
        stringQueueStorage.enqueueItem(_key, _value);
    }
    function string_dequeueItem(bytes32 _key) external {
        stringQueueStorage.dequeueItem(_key);
    }
    function string_removeItem(bytes32 _key, string _value) external {
        stringQueueStorage.removeItem(_key, _value);
    }


    // Uint queue tests
    function uint_capacity() public view returns (uint) {
        return uintQueueStorage.capacity();
    }
    function uint_getQueueLength(bytes32 _key) public view returns (uint) {
        return uintQueueStorage.getQueueLength(_key);
    }
    function uint_getQueueItem(bytes32 _key, uint _index) external view returns (uint) {
        return uintQueueStorage.getQueueItem(_key, _index);
    }
    function uint_getQueueIndexOf(bytes32 _key, uint _value) external view returns (int) {
        return uintQueueStorage.getQueueIndexOf(_key, _value);
    }
    function uint_enqueueItem(bytes32 _key, uint _value) external {
        uintQueueStorage.enqueueItem(_key, _value);
    }
    function uint_dequeueItem(bytes32 _key) external {
        uintQueueStorage.dequeueItem(_key);
    }
    function uint_removeItem(bytes32 _key, uint _value) external {
        uintQueueStorage.removeItem(_key, _value);
    }


}
