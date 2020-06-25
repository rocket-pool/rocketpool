pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "../interface/RocketRoleInterface.sol";

/// @title Role Based Access Control for Rocket Pool
/// @author David Rugendyke

contract RocketRole is RocketBase, RocketRoleInterface {


    // Events
    event RoleAdded(bytes32 indexed role, address indexed to);
    event RoleRemoved(bytes32 indexed role, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /**
     * @dev Allows the current owner to transfer control of the network to a new owner
     * @param _newOwner The address to transfer ownership to
     */
    function transferOwnership(address _newOwner) public onlyLatestContract("rocketRole", address(this)) onlyOwner {
        // Check new owner address
        require(_newOwner != address(0x0), "The new owner address is invalid");
        require(_newOwner != msg.sender, "The new owner address must not be the existing owner address");
        // Remove current owner
        deleteBool(keccak256(abi.encodePacked("access.role", "owner", msg.sender)));
        // Add new owner
        setBool(keccak256(abi.encodePacked("access.role", "owner", _newOwner)), true);
        // Emit ownership transferred event
        emit OwnershipTransferred(msg.sender, _newOwner);
    }


    /**
     * @dev Add a role to an address
     */
    function addRole(string memory _role, address _address) public onlyLatestContract("rocketRole", address(this)) onlySuperUser {
        // Check role
        require(keccak256(abi.encodePacked(_role)) != keccak256(abi.encodePacked("owner")), "The owner role cannot be added to an address");
        // Check address
        require(_address != address(0x0), "The address is invalid");
        // Check address does not already have role
        require(!getBool(keccak256(abi.encodePacked("access.role", _role, _address))), "The address already has access to this role");
        // Add role
        setBool(keccak256(abi.encodePacked("access.role", _role, _address)), true);
        // Emit role added event
        emit RoleAdded(keccak256(abi.encodePacked(_role)), _address);
    }


    /**
     * @dev Remove a role from an address
     */
    function removeRole(string memory _role, address _address) public onlyLatestContract("rocketRole", address(this)) onlySuperUser {
        // Check role is not being removed from owner address
        require(!roleHas("owner", _address), "Roles cannot be removed from the owner address");
        // Check address has role
        require(getBool(keccak256(abi.encodePacked("access.role", _role, _address))), "The address does not have access to this role");
        // Remove role
        deleteBool(keccak256(abi.encodePacked("access.role", _role, _address)));
        // Emit role removed event
        emit RoleRemoved(keccak256(abi.encodePacked(_role)), _address);
    }


}
