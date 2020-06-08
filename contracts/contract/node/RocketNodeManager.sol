pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/node/RocketNodeFactoryInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

// Node registration and management

contract RocketNodeManager is RocketBase, RocketNodeManagerInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of nodes in the network
    function getNodeCount() public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.index")));
    }

    // Get a node address by index
    function getNodeAt(uint256 _index) public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.index")), _index);
    }

    // Check whether a node exists
    function getNodeExists(address _nodeAddress) public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress)));
    }

    // Check whether a node is trusted
    function getNodeTrusted(address _nodeAddress) public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)));
    }

    // Get a node's contract address
    function getNodeContract(address _nodeAddress) public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("node.contract", _nodeAddress)));
    }

    // Get a node's timezone location
    function getNodeTimezoneLocation(address _nodeAddress) public view returns (string memory) {
        return getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }

    // Register a new node with Rocket Pool
    function registerNode(string calldata _timezoneLocation) external {
        // Load contracts
        RocketNodeFactoryInterface rocketNodeFactory = RocketNodeFactoryInterface(getContractAddress("rocketNodeFactory"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node settings
        require(rocketNodeSettings.getRegistrationEnabled(), "Rocket Pool node registrations are currently disabled");
        require(msg.sender.balance >= rocketNodeSettings.getMinimumBalance(), "The node account balance is less than the minimum registration balance");
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Check node is not registered
        require(!getBool(keccak256(abi.encodePacked("node.exists", msg.sender))), "The node is already registered in the Rocket Pool network");
        // Create node contract
        address contractAddress = rocketNodeFactory.createNode(msg.sender);
        // Initialise node data
        setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        setBool(keccak256(abi.encodePacked("node.trusted", msg.sender)), false);
        setAddress(keccak256(abi.encodePacked("node.contract", msg.sender)), contractAddress);
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Add node to index
        addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.index")), msg.sender);
    }

    // Set a node's trusted status
    function setNodeTrusted(address _nodeAddress, bool _trusted) external onlySuperUser {
        // Check node exists
        require(getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))), "The node does not exist");
        // Check current node status
        require(getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))) != _trusted, "The node's trusted status is already set");
        // Set status
        setBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)), _trusted);
    }

    // Set a node's timezone location
    function setTimezoneLocation(string calldata _timezoneLocation) external onlyRegisteredNode(msg.sender) {
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
    }

}
