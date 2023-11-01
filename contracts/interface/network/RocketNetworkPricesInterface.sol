pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only
interface RocketNetworkPricesInterface {
    function getPricesBlock() external view returns (uint256);
    function getRPLPrice() external view returns (uint256);
    function submitPrices(uint256 _block, uint256 _slotTimestamp, uint256 _rplPrice) external;
    function executeUpdatePrices(uint256 _block, uint256 _slotTimestamp, uint256 _rplPrice) external;
}
