pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedUpgradeInterface {
    function upgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) external;
}
