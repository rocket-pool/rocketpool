pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of minipools in the network
    function getMinipoolCount() public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.index")));
    }

    // Get a minipool address by index
    function getMinipoolAt(uint256 _index) public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.index")), _index);
    }

    // Create a minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function createMinipool(address _nodeAddress, uint256 _nodeDepositAmount, bool _nodeTrusted) override external onlyLatestContract("rocketNodeDeposit", msg.sender) returns (address) {
        // Load contracts
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node deposit amount; only trusted nodes can create empty minipools
        require(
            _nodeDepositAmount == rocketMinipoolSettings.getActivePoolNodeDeposit() ||
            _nodeDepositAmount == rocketMinipoolSettings.getIdlePoolNodeDeposit() ||
            (_nodeDepositAmount == rocketMinipoolSettings.getEmptyPoolNodeDeposit() && _nodeTrusted),
            "Invalid node deposit amount"
        );
        // Create minipool contract
        address contractAddress = rocketMinipoolFactory.createMinipool(_nodeAddress, _nodeDepositAmount);
        // Add minipool to index
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.index")), contractAddress);
        // Add minipool to queue
        rocketMinipoolQueue.enqueueMinipool(contractAddress, _nodeDepositAmount);
        // Return created minipool address
        return contractAddress;
    }

    // Destroy a minipool
    // Only accepts calls from the RocketMinipoolStatus contract
    function destroyMinipool() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

}
