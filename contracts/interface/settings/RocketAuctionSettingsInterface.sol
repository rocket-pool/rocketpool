pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketAuctionSettingsInterface {
    function getStartEnabled() external view returns (bool);
    function getMaximumLotEthValue() external view returns (uint256);
    function getStartingPriceRatio() external view returns (uint256);
    function getReservePriceRatio() external view returns (uint256);
    function getDuration() external view returns (uint256);
}
