pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Events
    event MinipoolCreated(address indexed minipool, address indexed node, uint256 created);
    event MinipoolDestroyed(address indexed minipool, address indexed node, uint256 destroyed);

    // Get the number of minipools in the network
    function getMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.index")));
    }

    // Get a network minipool address by index
    function getMinipoolAt(uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.index")), _index);
    }

    // Get the number of minipools owned by a node
    function getNodeMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
    }

    // Get a node minipool address by index
    function getNodeMinipoolAt(address _nodeAddress, uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), _index);
    }

    // Get a minipool address by validator pubkey
    function getMinipoolByPubkey(bytes memory _pubkey) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)));
    }

    // Check whether a minipool exists
    function getMinipoolExists(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress)));
    }

    // Get a minipool's validator pubkey
    function getMinipoolPubkey(address _minipoolAddress) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked("minipool.pubkey", _minipoolAddress)));
    }

    // Get a minipool's total balance at withdrawal
    function getMinipoolWithdrawalTotalBalance(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.total", _minipoolAddress)));
    }

    // Get a minipool's node balance at withdrawal
    function getMinipoolWithdrawalNodeBalance(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.node", _minipoolAddress)));
    }

    // Get a minipool's withdrawal finalized status
    function getMinipoolWithdrawalFinal(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.withdrawal.final", _minipoolAddress)));
    }

    // Get a minipool's withdrawal processed status
    function getMinipoolWithdrawalProcessed(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.withdrawal.processed", _minipoolAddress)));
    }

    // Create a minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function createMinipool(address _nodeAddress, MinipoolDeposit _depositType) override external onlyLatestContract("rocketNodeDeposit", msg.sender) returns (address) {
        // Load contracts
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Create minipool contract
        address contractAddress = rocketMinipoolFactory.createMinipool(_nodeAddress, _depositType);
        // Initialize minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", contractAddress)), true);
        // Add minipool to indexes
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.index")), contractAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), contractAddress);
        // Add minipool to queue
        rocketMinipoolQueue.enqueueMinipool(_depositType, contractAddress);
        // Emit minipool created event
        emit MinipoolCreated(contractAddress, _nodeAddress, now);
        // Return created minipool address
        return contractAddress;
    }

    // Destroy a minipool
    // Only accepts calls from registered minipools
    function destroyMinipool() override external onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Initialize minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Update minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)), false);
        // Remove minipool from indexes
        addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.index")), msg.sender);
        addressSetStorage.removeItem(keccak256(abi.encodePacked("node.minipools.index", nodeAddress)), msg.sender);
        // Emit minipool destroyed event
        emit MinipoolDestroyed(msg.sender, nodeAddress, now);
    }

    // Set a minipool's validator pubkey
    // Only accepts calls from registered minipools
    function setMinipoolPubkey(bytes calldata _pubkey) override external onlyRegisteredMinipool(msg.sender) {
        setBytes(keccak256(abi.encodePacked("minipool.pubkey", msg.sender)), _pubkey);
        setAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)), msg.sender);
    }

    // Set a minipool's withdrawal balances and finalize withdrawal
    // Only accepts calls from the RocketMinipoolStatus contract
    function setMinipoolWithdrawalBalances(address _minipoolAddress, uint256 _total, uint256 _node) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        setUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.total", _minipoolAddress)), _total);
        setUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.node", _minipoolAddress)), _node);
        setBool(keccak256(abi.encodePacked("minipool.withdrawal.final", _minipoolAddress)), true);
    }

    // Set a minipool's withdrawal processed status
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function setMinipoolWithdrawalProcessed(address _minipoolAddress, bool _processed) override external onlyLatestContract("rocketNetworkWithdrawal", msg.sender) {
        setBool(keccak256(abi.encodePacked("minipool.withdrawal.processed", _minipoolAddress)), _processed);
    }

}
