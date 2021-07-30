pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/auction/RocketAuctionManagerInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsAuctionInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// Facilitates RPL liquidation auctions

contract RocketAuctionManager is RocketBase, RocketAuctionManagerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event LotCreated(uint256 indexed lotIndex, address indexed by, uint256 rplAmount, uint256 time);
    event BidPlaced(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 time);
    event BidClaimed(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 rplAmount, uint256 time);
    event RPLRecovered(uint256 indexed lotIndex, address indexed by, uint256 rplAmount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the total RPL balance of the contract
    function getTotalRPLBalance() override public view returns (uint256) {
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        return rocketVault.balanceOfToken("rocketAuctionManager", IERC20(getContractAddress("rocketTokenRPL")));
    }

    // Get/set the allotted RPL balance of the contract
    function getAllottedRPLBalance() override public view returns (uint256) {
        return getUint(keccak256("auction.rpl.allotted"));
    }
    function increaseAllottedRPLBalance(uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("auction.rpl.allotted")), _amount);
    }
    function decreaseAllottedRPLBalance(uint256 _amount) private {
        subUint(keccak256(abi.encodePacked("auction.rpl.allotted")), _amount);
    }

    // Get the remaining (unallotted) RPL balance of the contract
    function getRemainingRPLBalance() override public view returns (uint256) {
        return getTotalRPLBalance().sub(getAllottedRPLBalance());
    }

    // Get/set the number of lots for auction
    function getLotCount() override public view returns (uint256) {
        return getUint(keccak256("auction.lots.count"));
    }
    function setLotCount(uint256 _amount) private {
        setUint(keccak256("auction.lots.count"), _amount);
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
    function increaseLotTotalBidAmount(uint256 _index, uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("auction.lot.bid.total", _index)), _amount);
    }

    // Get/set the ETH amount bid on a lot by an address
    function getLotAddressBidAmount(uint256 _index, address _bidder) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)));
    }
    function setLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)), _amount);
    }
    function increaseLotAddressBidAmount(uint256 _index, address _bidder, uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("auction.lot.bid.address", _index, _bidder)), _amount);
    }

    // Get/set the lot's RPL recovered status
    function getLotRPLRecovered(uint256 _index) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("auction.lot.rpl.recovered", _index)));
    }
    function setLotRPLRecovered(uint256 _index, bool _recovered) private {
        setBool(keccak256(abi.encodePacked("auction.lot.rpl.recovered", _index)), _recovered);
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
        return startPrice.sub(startPrice.sub(endPrice).mul(tn).mul(tn).div(td).div(td));
    }

    // Get the RPL price for a lot at the current block
    function getLotPriceAtCurrentBlock(uint256 _index) override public view returns (uint256) {
        return getLotPriceAtBlock(_index, block.number);
    }

    // Get the RPL price for a lot based on total ETH amount bid
    function getLotPriceByTotalBids(uint256 _index) override public view returns (uint256) {
        return calcBase.mul(getLotTotalBidAmount(_index)).div(getLotTotalRPLAmount(_index));
    }

    // Get the current RPL price for a lot
    // Returns the clearing price if cleared, or the price at the current block otherwise
    function getLotCurrentPrice(uint256 _index) override public view returns (uint256) {
        uint256 blockPrice = getLotPriceAtCurrentBlock(_index);
        uint256 bidPrice = getLotPriceByTotalBids(_index);
        if (bidPrice > blockPrice) { return bidPrice; }
        else { return blockPrice; }
    }

    // Get the amount of claimed RPL in a lot
    function getLotClaimedRPLAmount(uint256 _index) override public view returns (uint256) {
        uint256 claimed = calcBase.mul(getLotTotalBidAmount(_index)).div(getLotCurrentPrice(_index));
        uint256 total = getLotTotalRPLAmount(_index);
        // Due to integer arithmetic, the calculated claimed amount may be slightly greater than the total
        if (claimed > total) {
            return total;
        }
        return claimed;
    }

    // Get the amount of remaining RPL in a lot
    function getLotRemainingRPLAmount(uint256 _index) override public view returns (uint256) {
        return getLotTotalRPLAmount(_index).sub(getLotClaimedRPLAmount(_index));
    }

    // Check whether a lot has cleared
    function getLotIsCleared(uint256 _index) override external view returns (bool) {
        if (block.number >= getLotEndBlock(_index)) { return true; }
        if (getLotPriceByTotalBids(_index) >= getLotPriceAtCurrentBlock(_index)) { return true; }
        return false;
    }

    // Create a new lot for auction
    function createLot() override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketDAOProtocolSettingsAuctionInterface rocketAuctionSettings = RocketDAOProtocolSettingsAuctionInterface(getContractAddress("rocketDAOProtocolSettingsAuction"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
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
        emit LotCreated(lotIndex, msg.sender, lotRplAmount, block.timestamp);
    }

    // Bid on a lot
    function placeBid(uint256 _lotIndex) override external payable onlyLatestContract("rocketAuctionManager", address(this)) {
        // Load contracts
        RocketDAOProtocolSettingsAuctionInterface rocketAuctionSettings = RocketDAOProtocolSettingsAuctionInterface(getContractAddress("rocketDAOProtocolSettingsAuction"));
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
        uint256 maximumBidAmount = remainingRplAmount.mul(getLotPriceAtCurrentBlock(_lotIndex)).div(calcBase);
        if (bidAmount > maximumBidAmount) { bidAmount = maximumBidAmount; }
        // Increase lot bid amounts
        increaseLotTotalBidAmount(_lotIndex, bidAmount);
        increaseLotAddressBidAmount(_lotIndex, msg.sender, bidAmount);
        // Transfer bid amount to deposit pool
        rocketDepositPool.recycleLiquidatedStake{value: bidAmount}();
        // Refund excess ETH to sender
        if (msg.value > bidAmount) { msg.sender.transfer(msg.value.sub(bidAmount)); }
        // Emit bid placed event
        emit BidPlaced(_lotIndex, msg.sender, bidAmount, block.timestamp);
    }

    // Claim RPL from a lot
    function claimBid(uint256 _lotIndex) override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Check lot exists
        require(getLotExists(_lotIndex), "Lot does not exist");
        // Get lot price info
        uint256 blockPrice = getLotPriceAtCurrentBlock(_lotIndex);
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
        uint256 rplAmount = calcBase.mul(bidAmount).div(currentPrice);
        // Due to integer arithmetic, there may be a tiny bit less than calculated
        uint256 allottedAmount = getAllottedRPLBalance();
        if (rplAmount > allottedAmount) {
            rplAmount = allottedAmount;
        }
        // Transfer RPL to bidder
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawToken(msg.sender, IERC20(getContractAddress("rocketTokenRPL")), rplAmount);
        // Decrease allotted RPL balance & update address bid amount
        decreaseAllottedRPLBalance(rplAmount);
        setLotAddressBidAmount(_lotIndex, msg.sender, 0);
        // Emit bid claimed event
        emit BidClaimed(_lotIndex, msg.sender, bidAmount, rplAmount, block.timestamp);
    }

    // Recover unclaimed RPL from a lot
    function recoverUnclaimedRPL(uint256 _lotIndex) override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Check lot exists and has not already had RPL recovered
        require(getLotExists(_lotIndex), "Lot does not exist");
        require(!getLotRPLRecovered(_lotIndex), "Unclaimed RPL has already been recovered from the lot");
        // Check RPL can be reclaimed from lot
        require(block.number >= getLotEndBlock(_lotIndex), "Lot bidding period has not concluded yet");
        // Get & check remaining RPL amount
        uint256 remainingRplAmount = getLotRemainingRPLAmount(_lotIndex);
        require(remainingRplAmount > 0, "No unclaimed RPL is available to recover");
        // Decrease allotted RPL balance & set RPL recovered status
        decreaseAllottedRPLBalance(remainingRplAmount);
        setLotRPLRecovered(_lotIndex, true);
        // Emit RPL recovered event
        emit RPLRecovered(_lotIndex, msg.sender, remainingRplAmount, block.timestamp);
    }

}
