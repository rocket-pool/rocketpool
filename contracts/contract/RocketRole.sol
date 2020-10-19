pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "../interface/RocketRoleInterface.sol";

/// @title Role Based Access Control for Rocket Pool
/// @author David Rugendyke

contract RocketRole is RocketBase, RocketRoleInterface {


    // Events
    event RoleTransferred(bytes32 indexed role, address indexed from, address indexed to);


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
        // There are two main roles, RP (owner - added in RocketStorage up deployment) and DAO (will be transferred to dao address later)
        setBool(keccak256(abi.encodePacked("access.role", "dao", address(msg.sender))), true);
    }


    /**
     * @dev Allows the current owner to transfer control of the their role to a new owner
     * @param _newOwner The address to transfer ownership to
     */
    function transferRole(string memory _role, address _newOwner) override external onlyLatestContract("rocketRole", address(this)) onlyOwner {
        // Is the owner of the current role the one changing it?
        require(roleHas(_role, msg.sender), "Account does not own the current role");
        // Check new owner address
        require(_newOwner != address(0x0), "The new role address is invalid");
        require(_newOwner != msg.sender, "The new role address must not be the existing role address");
        // Remove current owner
        deleteBool(keccak256(abi.encodePacked("access.role", _role, msg.sender)));
        // Add new owner
        setBool(keccak256(abi.encodePacked("access.role", _role, _newOwner)), true);
        // Emit ownership transferred event
        emit RoleTransferred(keccak256(abi.encodePacked(_role)), msg.sender, _newOwner);
    }


}
