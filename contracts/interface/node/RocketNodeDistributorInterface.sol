pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeDistributorInterface {
    function getNodeShare() external view returns (uint256);
    function getUserShare() external view returns (uint256);
    function distribute() external;
}
