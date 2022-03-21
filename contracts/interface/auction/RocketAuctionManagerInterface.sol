pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketAuctionManagerInterface {
    function getTotalGGPBalance() external view returns (uint256);
    function getAllottedGGPBalance() external view returns (uint256);
    function getRemainingGGPBalance() external view returns (uint256);
    function getLotCount() external view returns (uint256);
    function getLotExists(uint256 _index) external view returns (bool);
    function getLotStartBlock(uint256 _index) external view returns (uint256);
    function getLotEndBlock(uint256 _index) external view returns (uint256);
    function getLotStartPrice(uint256 _index) external view returns (uint256);
    function getLotReservePrice(uint256 _index) external view returns (uint256);
    function getLotTotalGGPAmount(uint256 _index) external view returns (uint256);
    function getLotTotalBidAmount(uint256 _index) external view returns (uint256);
    function getLotAddressBidAmount(uint256 _index, address _bidder) external view returns (uint256);
    function getLotGGPRecovered(uint256 _index) external view returns (bool);
    function getLotPriceAtBlock(uint256 _index, uint256 _block) external view returns (uint256);
    function getLotPriceAtCurrentBlock(uint256 _index) external view returns (uint256);
    function getLotPriceByTotalBids(uint256 _index) external view returns (uint256);
    function getLotCurrentPrice(uint256 _index) external view returns (uint256);
    function getLotClaimedGGPAmount(uint256 _index) external view returns (uint256);
    function getLotRemainingGGPAmount(uint256 _index) external view returns (uint256);
    function getLotIsCleared(uint256 _index) external view returns (bool);
    function createLot() external;
    function placeBid(uint256 _lotIndex) external payable;
    function claimBid(uint256 _lotIndex) external;
    function recoverUnclaimedGGP(uint256 _lotIndex) external;
}
