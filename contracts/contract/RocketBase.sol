pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../interface/RocketStorageInterface.sol";

/// @title Base settings / modifiers for each contract in Rocket Pool
/// @author David Rugendyke

abstract contract RocketBase {


    /**** Properties ************/


    uint8 public version;                                                   // Version of this contract


    /*** Contracts **************/


    RocketStorageInterface rocketStorage = RocketStorageInterface(0);       // The main storage contract where primary persistant storage is maintained


    /*** Modifiers **************/


    /**
    * @dev Throws if called by any sender that doesn't match one of the supplied contract or is the latest version of that contract
    */
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName))), "Invalid or outdated contract");
        _;
    }


    /**
    * @dev Throws if called by any sender that isn't a registered node
    */
    modifier onlyRegisteredNode(address _nodeAddress) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))) == true, "Invalid node");
        _;
    }


    /**
    * @dev Throws if called by any sender that isn't a registered node contract
    */
    modifier onlyRegisteredNodeContract(address _nodeAddress, address _nodeContract) {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeAddress))) == _nodeContract, "Invalid node contract");
        _;
    }


    /**
    * @dev Throws if called by any sender that isn't a trusted node
    */
    modifier onlyTrustedNode(address _nodeAddress) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))) == true, "Invalid trusted node");
        _;
    }


    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyOwner() {
        require(roleHas("owner", msg.sender), "Account is not the owner");
        _;
    }


    /**
    * @dev Modifier to scope access to admins
    */
    modifier onlyAdmin() {
        require(roleHas("admin", msg.sender), "Account is not an admin");
        _;
    }


    /**
    * @dev Modifier to scope access to admins
    */
    modifier onlySuperUser() {
        require(roleHas("owner", msg.sender) || roleHas("admin", msg.sender), "Account is not a super user");
        _;
    }


    /**
    * @dev Reverts if the address doesn't have this role
    */
    modifier onlyRole(string memory _role) {
        require(roleHas(_role, msg.sender), "Account does not match the specified role");
        _;
    }


    /*** Constructor ************/


    /// @dev Set the main Rocket Storage address
    constructor(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /*** Contract Utilities *****/


    /// @dev Get the the contracts address - This method should be called before interacting with any API contracts to ensure the latest address is used
    function getContractAddress(string memory _contractName) public view returns(address) {
        // Get the current API contract address
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
        // Check it
        require(address(contractAddress) != address(0x0), "Rocket Pool - Contract not found.");
        // Done
        return contractAddress;
    }


    /*** Role Utilities *********/


    /**
    * @dev Check if an address has this role
    */
    function roleHas(string memory _role, address _address) internal view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("access.role", _role, _address)));
    }


}
