pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRoleInterface {
    function transferOwnership(address _newOwner) external;
    function addRole(string memory _role, address _address) external;
    function removeRole(string memory _role, address _address) external;
}
