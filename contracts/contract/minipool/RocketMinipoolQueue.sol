pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/util/AddressQueueStorageInterface.sol";
import "../../lib/SafeMath.sol";

// Minipool queueing for deposit assignment

contract RocketMinipoolQueue is RocketBase, RocketMinipoolQueueInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the total length of the combined queues
    function getTotalLength() override public view returns (uint256) {
        return getActiveLength().add(getIdleLength()).add(getEmptyLength());
    }

    // Get the length of a queue
    function getActiveLength() override public view returns (uint256) {
        return getLength("minipools.available.active");
    }
    function getIdleLength() override public view returns (uint256) {
        return getLength("minipools.available.idle");
    }
    function getEmptyLength() override public view returns (uint256) {
        return getLength("minipools.available.empty");
    }
    function getLength(string memory _queueId) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(keccak256(abi.encodePacked(_queueId)));
    }

    // Get the total capacity of the combined queues
    function getTotalCapacity() override public view returns (uint256) {
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        return (
            getActiveLength().mul(rocketMinipoolSettings.getActivePoolUserDeposit())
        ).add(
            getIdleLength().mul(rocketMinipoolSettings.getIdlePoolUserDeposit())
        ).add(
            getEmptyLength().mul(rocketMinipoolSettings.getEmptyPoolUserDeposit())
        );
    }

    // Get the capacity of the next available minipool
    // Returns 0 if no minipools are available
    function getNextCapacity() override public view returns (uint256) {
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        if (getIdleLength() > 0) { return rocketMinipoolSettings.getIdlePoolUserDeposit(); }
        if (getActiveLength() > 0) { return rocketMinipoolSettings.getActivePoolUserDeposit(); }
        if (getEmptyLength() > 0) { return rocketMinipoolSettings.getEmptyPoolUserDeposit(); }
        return 0;
    }

    // Add a minipool to the end of the appropriate queue
    // Only accepts calls from the RocketMinipoolManager contract
    function enqueueMinipool(address _minipool, uint256 _nodeDepositAmount) override external onlyLatestContract("rocketMinipoolManager", msg.sender) {
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        if (_nodeDepositAmount == rocketMinipoolSettings.getActivePoolNodeDeposit()) { return enqueueMinipool("minipools.available.active", _minipool); }
        if (_nodeDepositAmount == rocketMinipoolSettings.getIdlePoolNodeDeposit()) { return enqueueMinipool("minipools.available.idle", _minipool); }
        if (_nodeDepositAmount == rocketMinipoolSettings.getEmptyPoolNodeDeposit()) { return enqueueMinipool("minipools.available.empty", _minipool); }
        assert(false);
    }
    function enqueueMinipool(string memory _queueId, address _minipool) private {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(keccak256(abi.encodePacked(_queueId)), _minipool);
    }

    // Remove the first available minipool from the highest priority queue and return its address
    // Only accepts calls from the RocketDepositPool contract
    function dequeueMinipool() override external onlyLatestContract("rocketDepositPool", msg.sender) returns (address) {
        if (getIdleLength() > 0) { return dequeueMinipool("minipools.available.idle"); }
        if (getActiveLength() > 0) { return dequeueMinipool("minipools.available.active"); }
        if (getEmptyLength() > 0) { return dequeueMinipool("minipools.available.empty"); }
        assert(false);
    }
    function dequeueMinipool(string memory _queueId) private returns (address) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        address minipool = addressQueueStorage.getItem(keccak256(abi.encodePacked(_queueId)), 0);
        addressQueueStorage.dequeueItem(keccak256(abi.encodePacked(_queueId)));
        return minipool;
    }

    // Remove a minipool from a queue
    // Only accepts calls from the RocketMinipoolStatus contract
    function removeActiveMinipool(address _minipool) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        return removeMinipool("minipools.available.active", _minipool);
    }
    function removeIdleMinipool(address _minipool) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        return removeMinipool("minipools.available.idle", _minipool);
    }
    function removeEmptyMinipool(address _minipool) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        return removeMinipool("minipools.available.empty", _minipool);
    }
    function removeMinipool(string memory _queueId, address _minipool) private {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.removeItem(keccak256(abi.encodePacked(_queueId)), _minipool);
    }

}
