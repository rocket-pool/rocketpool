// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface LinkedListStorageInterface {
    struct DepositQueueValue {
        address receiver;      // the address that will receive the requested value
        uint32 validatorId;    // internal validator id
        uint32 suppliedValue;  // in milliether
        uint32 requestedValue; // in milliether
    }

    struct DepositQueueKey {
        address receiver;      // the address that will receive the requested value
        uint32 validatorId;    // internal validator id
    }

    function getLength(bytes32 _namespace) external view returns (uint256);
    function getItem(bytes32 _namespace, uint256 _index) external view returns (DepositQueueValue memory);
    function peekItem(bytes32 _namespace) external view returns (DepositQueueValue memory);
    function getIndexOf(bytes32 _namespace, DepositQueueKey memory _key) external view returns (uint256);
    function getHeadIndex(bytes32 _namespace) external view returns (uint256);
    function enqueueItem(bytes32 _namespace, DepositQueueValue memory _value) external;
    function dequeueItem(bytes32 _namespace) external returns (DepositQueueValue memory);
    function removeItem(bytes32 _namespace, DepositQueueKey memory _key) external;
    function scan(bytes32 _namespace, uint256 _startIndex, uint256 _count) external view returns (DepositQueueValue[] memory entries, uint256 nextIndex);
}
