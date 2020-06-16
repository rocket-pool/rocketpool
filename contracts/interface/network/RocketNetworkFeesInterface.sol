pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkFeesInterface {
    function getNodeDemand() external view returns (int256);
    function getNodeFee() external view returns (uint256);
}
