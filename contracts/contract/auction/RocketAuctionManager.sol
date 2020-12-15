pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/auction/RocketAuctionManagerInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/settings/RocketAuctionSettingsInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// Facilitates RPL liquidation auctions

contract RocketAuctionManager is RocketBase, RocketAuctionManagerInterface {

    // Libs
    using SafeMath for uint;

    // Events

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the total RPL balance of the contract
    function getTotalRPLBalance() override public view returns (uint256) {
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        return rocketVault.balanceOfToken("rocketAuctionManager", getContractAddress("rocketTokenRPL"));
    }

    // Get the remaining RPL balance of the contract
    function getRemainingRPLBalance() override public view returns (uint256) {
        return getTotalRPLBalance().sub(getAllottedRPLBalance());
    }

    // Get/set the allotted RPL balance of the contract
    function getAllottedRPLBalance() override public view returns (uint256) {
        return getUintS("auction.rpl.allotted");
    }
    function setAllottedRPLBalance(uint256 _amount) private {
        setUintS("auction.rpl.allotted", _amount);
    }

    // Get/set the number of lots for auction
    function getLotCount() override public view returns (uint256) {
        return getUintS("auction.lots.count");
    }
    function setLotCount(uint256 _amount) private {
        setUintS("auction.lots.count", _amount);
    }

    // Get lot details
    // TODO: check if active is necessary
    function getLotActive(uint256 _index) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("auction.lot.active", _index)));
    }
    function getLotStartBlock(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.start.block", _index)));
    }
    function getLotEndBlock(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.end.block", _index)));
    }
    function getLotTotalRPLAmount(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.rpl.total", _index)));
    }
    function getLotStartPrice(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.price.start", _index)));
    }
    function getLotReservePrice(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.price.reserve", _index)));
    }

    // Get/set the total ETH amount bid on a lot
    function getLotTotalBidAmount(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.bid.total", _index)));
    }
    function setLotTotalBidAmount(uint256 _index, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("auction.lot.bid.total", _index)), _amount);
    }

    // Get/set the ETH amount bid on a lot by an address
    function getLotAddressBidAmount(uint256 _index, address _bidder) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)));
    }
    function setLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)), _amount);
    }

    // Get the current RPL price for a lot
    function getLotCurrentPrice(uint256 _index) override public view returns (uint256) {
        // Get lot parameters
        uint256 startBlock = getLotStartBlock(_index);
        uint256 endBlock = getLotEndBlock(_index);
        uint256 startPrice = getLotStartPrice(_index);
        uint256 endPrice = getLotReservePrice(_index);
        // Calculate & return
        if (block.number <= startBlock) { return startPrice; }
        if (block.number >= endBlock) { return endPrice; }
        uint256 tn = block.number.sub(startBlock);
        uint256 td = endBlock.sub(startBlock);
        return startPrice.sub(startPrice.sub(endPrice).mul(tn).div(td).mul(tn).div(td));
    }

    // Get the claimed RPL amount in a lot
    function getLotClaimedRPLAmount(uint256 _index) override public view returns (uint256) {
        uint256 claimedRplAmount = getLotTotalBidAmount(_index).div(getLotCurrentPrice(_index));
        uint256 totalRplAmount = getLotTotalRPLAmount(_index);
        if (claimedRplAmount > totalRplAmount) { return totalRplAmount; }
        else { return claimedRplAmount; }
    }

    // Get the remaining RPL amount in a lot
    function getLotRemainingRPLAmount(uint256 _index) override public view returns (uint256) {
        return getLotTotalRPLAmount(_index).sub(getLotClaimedRPLAmount(_index));
    }

    // Create a new lot for auction
    function createLot() override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketAuctionSettingsInterface rocketAuctionSettings = RocketAuctionSettingsInterface(getContractAddress("rocketAuctionSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Get remaining RPL balance & RPL price
        uint256 remainingRplBalance = getRemainingRPLBalance();
        uint256 rplPrice = rocketNetworkPrices.getRPLPrice();
        // Check lot can be created
        require(rocketAuctionSettings.getCreateLotEnabled(), "Creating lots is currently disabled");
        require(remainingRplBalance >= rocketAuctionSettings.getLotMinimumEthValue().div(rplPrice), "Insufficient RPL balance to create new lot");
        // Calculate lot RPL amount
        uint256 lotRplAmount = remainingRplBalance;
        uint256 maximumLotRPlAmount = rocketAuctionSettings.getLotMaximumEthValue().div(rplPrice);
        if (lotRplAmount > maximumLotRPlAmount) { lotRplAmount = maximumLotRPlAmount; }
        // Create lot
        uint256 calcBase = 1 ether;
        uint256 lotIndex = getLotCount();
        setBool(keccak256(abi.encodePacked("auction.lot.active", lotIndex)), true);
        setUint(keccak256(abi.encodePacked("auction.lot.start.block", lotIndex)), block.number);
        setUint(keccak256(abi.encodePacked("auction.lot.end.block", lotIndex)), block.number.add(rocketAuctionSettings.getLotDuration()));
        setUint(keccak256(abi.encodePacked("auction.lot.rpl.total", lotIndex)), lotRplAmount);
        setUint(keccak256(abi.encodePacked("auction.lot.price.start", lotIndex)), rplPrice.mul(rocketAuctionSettings.getStartingPriceRatio()).div(calcBase));
        setUint(keccak256(abi.encodePacked("auction.lot.price.reserve", lotIndex)), rplPrice.mul(rocketAuctionSettings.getReservePriceRatio()).div(calcBase));
        // Increment lot count & increase allotted RPL balance
        setLotCount(lotIndex.add(1));
        increaseAllottedRPLBalance(lotRplAmount);
    }

    // Bid on a lot
    function bidOnLot(uint256 _index) override external payable onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketAuctionSettingsInterface rocketAuctionSettings = RocketAuctionSettingsInterface(getContractAddress("rocketAuctionSettings"));
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Check lot can be bid on
        require(rocketAuctionSettings.getBidOnLotEnabled(), "Bidding on lots is currently disabled");
        require(getLotActive(_index), "Lot is no longer active");
        require(block.number < getLotEndBlock(_index), "Lot bidding period has concluded");
        // Check lot has RPL remaining
        uint256 remainingRplAmount = getLotRemainingRPLAmount(_index);
        require(remainingRplAmount > 0, "Lot RPL allocation has been exhausted");
        // Calculate the bid amount
        uint256 maxBidAmount = remainingRplAmount.mul(getLotCurrentPrice(_index));
        uint256 bidAmount = msg.value;
        if (bidAmount > maxBidAmount) { bidAmount = maxBidAmount; }
        // Increase lot bid amounts
        increaseLotTotalBidAmount(_index, bidAmount);
        increaseLotAddressBidAmount(_index, msg.sender, bidAmount);
        // Transfer bid amount to deposit pool
        rocketDepositPool.recycleLiquidatedStake{value: bidAmount}();
        // Refund excess ETH to sender
        if (bidAmount < msg.value) { msg.sender.transfer(msg.value.sub(bidAmount)); }
    }

    // Increase/decrease the allotted RPL balance
    function increaseAllottedRPLBalance(uint256 _amount) private {
        setAllottedRPLBalance(getAllottedRPLBalance().add(_amount));
    }
    function decreaseAllottedRPLBalance(uint256 _amount) private {
        setAllottedRPLBalance(getAllottedRPLBalance().sub(_amount));
    }

    // Increase ETH bid amounts on a lot
    function increaseLotTotalBidAmount(uint256 _index, uint256 _amount) private {
        setLotTotalBidAmount(_index, getLotTotalBidAmount(_index).add(_amount));
    }
    function increaseLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        setLotAddressBidAmount(_index, _bidder, getLotAddressBidAmount(_index, _bidder).add(_amount));
    }

}
