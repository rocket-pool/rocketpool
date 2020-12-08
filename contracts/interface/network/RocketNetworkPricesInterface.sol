pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkPricesInterface {
    function getPricesBlock() external view returns (uint256);
    function getRPLPrice() external view returns (uint256);
    function submitPrices(uint256 _block, uint256 _rplPrice) external;
}
