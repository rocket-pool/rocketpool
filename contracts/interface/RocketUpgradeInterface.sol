pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketUpgradeInterface {
    function upgradeContract(string calldata _name, address _contractAddress, string calldata _contractAbi) external;
    function addContract(string calldata _name, address _contractAddress, string calldata _contractAbi) external;
    function upgradeABI(string calldata _name, string calldata _contractAbi) external;
    function addABI(string calldata _name, string calldata _contractAbi) external;
}
