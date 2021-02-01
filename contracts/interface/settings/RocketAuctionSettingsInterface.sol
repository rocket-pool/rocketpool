pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketAuctionSettingsInterface {
    function getCreateLotEnabled() external view returns (bool);
    function getBidOnLotEnabled() external view returns (bool);
    function getLotMinimumEthValue() external view returns (uint256);
    function getLotMaximumEthValue() external view returns (uint256);
    function getLotDuration() external view returns (uint256);
    function getStartingPriceRatio() external view returns (uint256);
    function getReservePriceRatio() external view returns (uint256);
}
