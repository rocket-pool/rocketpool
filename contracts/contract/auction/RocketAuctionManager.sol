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
    event LotCreated(uint256 indexed index, address indexed by, uint256 rplAmount, uint256 time);
    event BidPlaced(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 time);
    event BidClaimed(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 rplAmount, uint256 time);
    event RPLRecovered(uint256 indexed lotIndex, address indexed by, uint256 rplAmount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the total RPL balance of the contract
    function getTotalRPLBalance() override public view returns (uint256) {
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        return rocketVault.balanceOfToken("rocketAuctionManager", getContractAddress("rocketTokenRPL"));
    }

    // Get/set the allotted RPL balance of the contract
    function getAllottedRPLBalance() override public view returns (uint256) {
        return getUintS("auction.rpl.allotted");
    }
    function setAllottedRPLBalance(uint256 _amount) private {
        setUintS("auction.rpl.allotted", _amount);
    }
    function increaseAllottedRPLBalance(uint256 _amount) private {
        setAllottedRPLBalance(getAllottedRPLBalance().add(_amount));
    }
    function decreaseAllottedRPLBalance(uint256 _amount) private {
        setAllottedRPLBalance(getAllottedRPLBalance().sub(_amount));
    }

    // Get the remaining (unallotted) RPL balance of the contract
    function getRemainingRPLBalance() override public view returns (uint256) {
        return getTotalRPLBalance().sub(getAllottedRPLBalance());
    }

    // Get/set the number of lots for auction
    function getLotCount() override public view returns (uint256) {
        return getUintS("auction.lots.count");
    }
    function setLotCount(uint256 _amount) private {
        setUintS("auction.lots.count", _amount);
    }

    // Get lot details
    function getLotExists(uint256 _index) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("auction.lot.exists", _index)));
    }
    function getLotStartBlock(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.block.start", _index)));
    }
    function getLotEndBlock(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.block.end", _index)));
    }
    function getLotStartPrice(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.price.start", _index)));
    }
    function getLotReservePrice(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.price.reserve", _index)));
    }
    function getLotTotalRPLAmount(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.rpl.total", _index)));
    }

    // Get/set the total ETH amount bid on a lot
    function getLotTotalBidAmount(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.bid.total", _index)));
    }
    function setLotTotalBidAmount(uint256 _index, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("auction.lot.bid.total", _index)), _amount);
    }
    function increaseLotTotalBidAmount(uint256 _index, uint256 _amount) private {
        setLotTotalBidAmount(_index, getLotTotalBidAmount(_index).add(_amount));
    }

    // Get/set the ETH amount bid on a lot by an address
    function getLotAddressBidAmount(uint256 _index, address _bidder) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)));
    }
    function setLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)), _amount);
    }
    function increaseLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        setLotAddressBidAmount(_index, _bidder, getLotAddressBidAmount(_index, _bidder).add(_amount));
    }

    // Get the RPL price for a lot at a block
    function getLotPriceAtBlock(uint256 _index, uint256 _block) override public view returns (uint256) {
        // Get lot parameters
        uint256 startBlock = getLotStartBlock(_index);
        uint256 endBlock = getLotEndBlock(_index);
        uint256 startPrice = getLotStartPrice(_index);
        uint256 endPrice = getLotReservePrice(_index);
        // Calculate & return
        if (_block <= startBlock) { return startPrice; }
        if (_block >= endBlock) { return endPrice; }
        uint256 tn = _block.sub(startBlock);
        uint256 td = endBlock.sub(startBlock);
        return startPrice.sub(startPrice.sub(endPrice).mul(tn).div(td).mul(tn).div(td));
    }

    // Get the RPL price for a lot based on total ETH amount bid
    function getLotPriceByTotalBids(uint256 _index) override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        return calcBase.mul(getLotTotalBidAmount(_index)).div(getLotTotalRPLAmount(_index));
    }

    // Get the current RPL price for a lot
    // Returns the clearing price if cleared, or the price at the current block otherwise
    function getLotCurrentPrice(uint256 _index) override public view returns (uint256) {
        uint256 blockPrice = getLotPriceAtBlock(_index, block.number);
        uint256 bidPrice = getLotPriceByTotalBids(_index);
        if (bidPrice > blockPrice) { return bidPrice; }
        else { return blockPrice; }
    }

    // Get the amount of claimed RPL in a lot
    function getLotClaimedRPLAmount(uint256 _index) override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        return calcBase.mul(getLotTotalBidAmount(_index)).div(getLotCurrentPrice(_index));
    }

    // Get the amount of remaining RPL in a lot
    function getLotRemainingRPLAmount(uint256 _index) override public view returns (uint256) {
        return getLotTotalRPLAmount(_index).sub(getLotClaimedRPLAmount(_index));
    }

    // Check whether a lot has cleared
    function getLotIsCleared(uint256 _index) override public view returns (bool) {
        if (block.number >= getLotEndBlock(_index)) { return true; }
        if (getLotPriceByTotalBids(_index) >= getLotPriceAtBlock(_index, block.number)) { return true; }
        return false;
    }

    // Create a new lot for auction
    function createLot() override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketAuctionSettingsInterface rocketAuctionSettings = RocketAuctionSettingsInterface(getContractAddress("rocketAuctionSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Calculation base value
        uint256 calcBase = 1 ether;
        // Get remaining RPL balance & RPL price
        uint256 remainingRplBalance = getRemainingRPLBalance();
        uint256 rplPrice = rocketNetworkPrices.getRPLPrice();
        // Check lot can be created
        require(rocketAuctionSettings.getCreateLotEnabled(), "Creating lots is currently disabled");
        require(remainingRplBalance >= calcBase.mul(rocketAuctionSettings.getLotMinimumEthValue()).div(rplPrice), "Insufficient RPL balance to create new lot");
        // Calculate lot RPL amount
        uint256 lotRplAmount = remainingRplBalance;
        uint256 maximumLotRplAmount = calcBase.mul(rocketAuctionSettings.getLotMaximumEthValue()).div(rplPrice);
        if (lotRplAmount > maximumLotRplAmount) { lotRplAmount = maximumLotRplAmount; }
        // Create lot
        uint256 lotIndex = getLotCount();
        setBool(keccak256(abi.encodePacked("auction.lot.exists", lotIndex)), true);
        setUint(keccak256(abi.encodePacked("auction.lot.block.start", lotIndex)), block.number);
        setUint(keccak256(abi.encodePacked("auction.lot.block.end", lotIndex)), block.number.add(rocketAuctionSettings.getLotDuration()));
        setUint(keccak256(abi.encodePacked("auction.lot.price.start", lotIndex)), rplPrice.mul(rocketAuctionSettings.getStartingPriceRatio()).div(calcBase));
        setUint(keccak256(abi.encodePacked("auction.lot.price.reserve", lotIndex)), rplPrice.mul(rocketAuctionSettings.getReservePriceRatio()).div(calcBase));
        setUint(keccak256(abi.encodePacked("auction.lot.rpl.total", lotIndex)), lotRplAmount);
        // Increment lot count & increase allotted RPL balance
        setLotCount(lotIndex.add(1));
        increaseAllottedRPLBalance(lotRplAmount);
        // Emit lot created event
        emit LotCreated(lotIndex, msg.sender, lotRplAmount, now);
    }

    // Bid on a lot
    function placeBid(uint256 _lotIndex) override external payable onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketAuctionSettingsInterface rocketAuctionSettings = RocketAuctionSettingsInterface(getContractAddress("rocketAuctionSettings"));
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Check bid amount
        require(msg.value > 0, "Invalid bid amount");
        // Check lot exists
        require(getLotExists(_lotIndex), "Lot does not exist");
        // Check lot can be bid on
        require(rocketAuctionSettings.getBidOnLotEnabled(), "Bidding on lots is currently disabled");
        require(block.number < getLotEndBlock(_lotIndex), "Lot bidding period has concluded");
        // Check lot has RPL remaining
        uint256 remainingRplAmount = getLotRemainingRPLAmount(_lotIndex);
        require(remainingRplAmount > 0, "Lot RPL allocation has been exhausted");
        // Calculate the bid amount
        uint256 bidAmount = msg.value;
        uint256 calcBase = 1 ether;
        uint256 maximumBidAmount = remainingRplAmount.mul(getLotPriceAtBlock(_lotIndex, block.number)).div(calcBase);
        if (bidAmount > maximumBidAmount) { bidAmount = maximumBidAmount; }
        // Increase lot bid amounts
        increaseLotTotalBidAmount(_lotIndex, bidAmount);
        increaseLotAddressBidAmount(_lotIndex, msg.sender, bidAmount);
        // Transfer bid amount to deposit pool
        rocketDepositPool.recycleLiquidatedStake{value: bidAmount}();
        // Refund excess ETH to sender
        if (msg.value > bidAmount) { msg.sender.transfer(msg.value.sub(bidAmount)); }
        // Emit bid placed event
        emit BidPlaced(_lotIndex, msg.sender, bidAmount, now);
    }

    // Claim RPL from a lot
    function claimBid(uint256 _lotIndex) override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Check lot exists
        require(getLotExists(_lotIndex), "Lot does not exist");
        // Get lot price info
        uint256 blockPrice = getLotPriceAtBlock(_lotIndex, block.number);
        uint256 bidPrice = getLotPriceByTotalBids(_lotIndex);
        // Check lot can be claimed from
        require(block.number >= getLotEndBlock(_lotIndex) || bidPrice >= blockPrice, "Lot has not cleared yet");
        // Get & check address bid amount
        uint256 bidAmount = getLotAddressBidAmount(_lotIndex, msg.sender);
        require(bidAmount > 0, "Address has no RPL to claim");
        // Calculate current lot price
        uint256 currentPrice;
        if (bidPrice > blockPrice) { currentPrice = bidPrice; }
        else { currentPrice = blockPrice; }
        // Calculate RPL claim amount
        uint256 calcBase = 1 ether;
        uint256 rplAmount = calcBase.mul(bidAmount).div(currentPrice);
        // Transfer RPL to bidder
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawToken(msg.sender, getContractAddress("rocketTokenRPL"), rplAmount);
        // Update address bid amount
        setLotAddressBidAmount(_lotIndex, msg.sender, 0);
        // Emit bid claimed event
        emit BidClaimed(_lotIndex, msg.sender, bidAmount, rplAmount, now);
    }

    // Recover unclaimed RPL from a lot
    function recoverUnclaimedRPL(uint256 _lotIndex) override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Check lot exists
        require(getLotExists(_lotIndex), "Lot does not exist");
        // Check RPL can be reclaimed from lot
        require(block.number >= getLotEndBlock(_lotIndex), "Lot bidding period has not concluded yet");
        // Get & check remaining RPL amount
        uint256 remainingRplAmount = getLotRemainingRPLAmount(_lotIndex);
        require(remainingRplAmount > 0, "No unclaimed RPL is available to recover");
        // Decrease allotted RPL balance
        decreaseAllottedRPLBalance(remainingRplAmount);
        // Emit RPL recovered event
        emit RPLRecovered(_lotIndex, msg.sender, remainingRplAmount, now);
    }

}
