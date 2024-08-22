pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

struct DepositQueueValue {
    address receiver;
    uint32 validatorIndex;
    uint32 suppliedValue;  // in milliether
    uint32 requestedValue; // in milliether
}

interface AddressLinkedQueueStorageInterface {
    function getLength(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (DepositQueueValue memory);
    function getIndexOf(bytes32 _key, DepositQueueValue memory _value) external view returns (int);
    function enqueueItem(bytes32 _key, DepositQueueValue memory _value) external;
    function dequeueItem(bytes32 _key) external returns (address);
    function removeItem(bytes32 _key, DepositQueueValue memory _value) external;
}
