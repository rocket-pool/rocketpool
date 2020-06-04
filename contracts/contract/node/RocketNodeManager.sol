pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/node/RocketNodeFactoryInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";

// Node registration and management

contract RocketNodeManager is RocketBase, RocketNodeManagerInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of available nodes in the network
    function getAvailableNodeCount() public view returns (uint256) {}

    // Get a random available node in the network
    function getRandomAvailableNode() public view returns (address) {}

    // Register a new node with Rocket Pool
    function registerNode(string calldata _timezoneLocation) external {
        // Load contracts
        RocketNodeFactoryInterface rocketNodeFactory = RocketNodeFactoryInterface(getContractAddress("rocketNodeFactory"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
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

}
