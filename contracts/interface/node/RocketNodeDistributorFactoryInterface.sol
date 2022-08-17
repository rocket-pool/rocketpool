pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeDistributorFactoryInterface {
    function getProxyBytecode() external pure returns (bytes memory);
    function getProxyAddress(address _nodeAddress) external view returns(address);
    function createProxy(address _nodeAddress) external;
}
