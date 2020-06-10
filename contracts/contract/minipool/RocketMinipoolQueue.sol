pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/util/AddressQueueStorageInterface.sol";
import "../../lib/SafeMath.sol";
import "../../types/MinipoolDeposit.sol";

// Minipool queueing for deposit assignment

contract RocketMinipoolQueue is RocketBase, RocketMinipoolQueueInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the total combined length of the queues
    function getTotalLength() override public view returns (uint256) {
        return (
            getLength(MinipoolDeposit.Full)
        ).add(
            getLength(MinipoolDeposit.Half)
        ).add(
            getLength(MinipoolDeposit.Empty)
        );
    }

    // Get the length of a queue
    // Returns 0 for invalid queues
    function getLength(MinipoolDeposit _depositType) override public view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getLength("minipools.available.full"); }
        if (_depositType == MinipoolDeposit.Half) { return getLength("minipools.available.half"); }
        if (_depositType == MinipoolDeposit.Empty) { return getLength("minipools.available.empty"); }
        return 0;
    }
    function getLength(string memory _queueId) private view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(keccak256(abi.encodePacked(_queueId)));
    }

    // Get the total combined capacity of the queues
    function getTotalCapacity() override public view returns (uint256) {
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        return (
            getLength(MinipoolDeposit.Full).mul(rocketMinipoolSettings.getFullDepositUserAmount())
        ).add(
            getLength(MinipoolDeposit.Half).mul(rocketMinipoolSettings.getHalfDepositUserAmount())
        ).add(
            getLength(MinipoolDeposit.Empty).mul(rocketMinipoolSettings.getEmptyDepositUserAmount())
        );
    }

    // Get the capacity of the next available minipool
    // Returns 0 if no minipools are available
    function getNextCapacity() override public view returns (uint256) {
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        if (getLength(MinipoolDeposit.Half) > 0) { return rocketMinipoolSettings.getHalfDepositUserAmount(); }
        if (getLength(MinipoolDeposit.Full) > 0) { return rocketMinipoolSettings.getFullDepositUserAmount(); }
        if (getLength(MinipoolDeposit.Empty) > 0) { return rocketMinipoolSettings.getEmptyDepositUserAmount(); }
        return 0;
    }

    // Add a minipool to the end of the appropriate queue
    // Reverts for invalid queues
    // Only accepts calls from the RocketMinipoolManager contract
    function enqueueMinipool(MinipoolDeposit _depositType, address _minipool) override external onlyLatestContract("rocketMinipoolManager", msg.sender) {
        if (_depositType == MinipoolDeposit.Full) { return enqueueMinipool("minipools.available.full", _minipool); }
        if (_depositType == MinipoolDeposit.Half) { return enqueueMinipool("minipools.available.half", _minipool); }
        if (_depositType == MinipoolDeposit.Empty) { return enqueueMinipool("minipools.available.empty", _minipool); }
        assert(false);
    }
    function enqueueMinipool(string memory _queueId, address _minipool) private {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.enqueueItem(keccak256(abi.encodePacked(_queueId)), _minipool);
    }

    // Remove the first available minipool from the highest priority queue and return its address
    // Reverts if no minipools are available
    // Only accepts calls from the RocketDepositPool contract
    function dequeueMinipool() override external onlyLatestContract("rocketDepositPool", msg.sender) returns (address) {
        if (getLength(MinipoolDeposit.Half) > 0) { return dequeueMinipool("minipools.available.half"); }
        if (getLength(MinipoolDeposit.Full) > 0) { return dequeueMinipool("minipools.available.full"); }
        if (getLength(MinipoolDeposit.Empty) > 0) { return dequeueMinipool("minipools.available.empty"); }
        assert(false);
    }
    function dequeueMinipool(string memory _queueId) private returns (address) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.dequeueItem(keccak256(abi.encodePacked(_queueId)));
    }

    // Remove a minipool from a queue
    // Reverts for invalid queues
    // Only accepts calls from the RocketMinipoolStatus contract
    function removeMinipool(MinipoolDeposit _depositType, address _minipool) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        if (_depositType == MinipoolDeposit.Full) { return removeMinipool("minipools.available.full", _minipool); }
        if (_depositType == MinipoolDeposit.Half) { return removeMinipool("minipools.available.half", _minipool); }
        if (_depositType == MinipoolDeposit.Empty) { return removeMinipool("minipools.available.empty", _minipool); }
        assert(false);
    }
    function removeMinipool(string memory _queueId, address _minipool) private {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        addressQueueStorage.removeItem(keccak256(abi.encodePacked(_queueId)), _minipool);
    }

}
