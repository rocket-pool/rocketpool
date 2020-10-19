pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRoleInterface {
    function transferRole(string memory _role, address _newOwner) external;
}
