pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/auction/RocketAuctionManagerInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsAuctionInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// Facilitates GGP liquidation auctions

contract RocketAuctionManager is RocketBase, RocketAuctionManagerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event LotCreated(uint256 indexed lotIndex, address indexed by, uint256 ggpAmount, uint256 time);
    event BidPlaced(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 time);
    event BidClaimed(uint256 indexed lotIndex, address indexed by, uint256 bidAmount, uint256 ggpAmount, uint256 time);
    event GGPRecovered(uint256 indexed lotIndex, address indexed by, uint256 ggpAmount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the total GGP balance of the contract
    function getTotalGGPBalance() override public view returns (uint256) {
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        return rocketVault.balanceOfToken("rocketAuctionManager", IERC20(getContractAddress("gogoTokenGGP")));
    }

    // Get/set the allotted GGP balance of the contract
    function getAllottedGGPBalance() override public view returns (uint256) {
        return getUint(keccak256("auction.ggp.allotted"));
    }
    function increaseAllottedGGPBalance(uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("auction.ggp.allotted")), _amount);
    }
    function decreaseAllottedGGPBalance(uint256 _amount) private {
        subUint(keccak256(abi.encodePacked("auction.ggp.allotted")), _amount);
    }

    // Get the remaining (unallotted) GGP balance of the contract
    function getRemainingGGPBalance() override public view returns (uint256) {
        return getTotalGGPBalance().sub(getAllottedGGPBalance());
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
    function getLotTotalGGPAmount(uint256 _index) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("auction.lot.ggp.total", _index)));
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

    // Get/set the lot's GGP recovered status
    function getLotGGPRecovered(uint256 _index) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("auction.lot.ggp.recovered", _index)));
    }
    function setLotGGPRecovered(uint256 _index, bool _recovered) private {
        setBool(keccak256(abi.encodePacked("auction.lot.ggp.recovered", _index)), _recovered);
    }

    // Get the GGP price for a lot at a block
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

    // Get the GGP price for a lot at the current block
    function getLotPriceAtCurrentBlock(uint256 _index) override public view returns (uint256) {
        return getLotPriceAtBlock(_index, block.number);
    }

    // Get the GGP price for a lot based on total ETH amount bid
    function getLotPriceByTotalBids(uint256 _index) override public view returns (uint256) {
        return calcBase.mul(getLotTotalBidAmount(_index)).div(getLotTotalGGPAmount(_index));
    }

    // Get the current GGP price for a lot
    // Returns the clearing price if cleared, or the price at the current block otherwise
    function getLotCurrentPrice(uint256 _index) override public view returns (uint256) {
        uint256 blockPrice = getLotPriceAtCurrentBlock(_index);
        uint256 bidPrice = getLotPriceByTotalBids(_index);
        if (bidPrice > blockPrice) { return bidPrice; }
        else { return blockPrice; }
    }

    // Get the amount of claimed GGP in a lot
    function getLotClaimedGGPAmount(uint256 _index) override public view returns (uint256) {
        uint256 claimed = calcBase.mul(getLotTotalBidAmount(_index)).div(getLotCurrentPrice(_index));
        uint256 total = getLotTotalGGPAmount(_index);
        // Due to integer arithmetic, the calculated claimed amount may be slightly greater than the total
        if (claimed > total) {
            return total;
        }
        return claimed;
    }

    // Get the amount of remaining GGP in a lot
    function getLotRemainingGGPAmount(uint256 _index) override public view returns (uint256) {
        return getLotTotalGGPAmount(_index).sub(getLotClaimedGGPAmount(_index));
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
        // Get remaining GGP balance & GGP price
        uint256 remainingGgpBalance = getRemainingGGPBalance();
        uint256 ggpPrice = rocketNetworkPrices.getGGPPrice();
        // Check lot can be created
        require(rocketAuctionSettings.getCreateLotEnabled(), "Creating lots is currently disabled");
        require(remainingGgpBalance >= calcBase.mul(rocketAuctionSettings.getLotMinimumEthValue()).div(ggpPrice), "Insufficient GGP balance to create new lot");
        // Calculate lot GGP amount
        uint256 lotGgpAmount = remainingGgpBalance;
        uint256 maximumLotGgpAmount = calcBase.mul(rocketAuctionSettings.getLotMaximumEthValue()).div(ggpPrice);
        if (lotGgpAmount > maximumLotGgpAmount) { lotGgpAmount = maximumLotGgpAmount; }
        // Create lot
        uint256 lotIndex = getLotCount();
        setBool(keccak256(abi.encodePacked("auction.lot.exists", lotIndex)), true);
        setUint(keccak256(abi.encodePacked("auction.lot.block.start", lotIndex)), block.number);
        setUint(keccak256(abi.encodePacked("auction.lot.block.end", lotIndex)), block.number.add(rocketAuctionSettings.getLotDuration()));
        setUint(keccak256(abi.encodePacked("auction.lot.price.start", lotIndex)), ggpPrice.mul(rocketAuctionSettings.getStartingPriceRatio()).div(calcBase));
        setUint(keccak256(abi.encodePacked("auction.lot.price.reserve", lotIndex)), ggpPrice.mul(rocketAuctionSettings.getReservePriceRatio()).div(calcBase));
        setUint(keccak256(abi.encodePacked("auction.lot.ggp.total", lotIndex)), lotGgpAmount);
        // Increment lot count & increase allotted GGP balance
        setLotCount(lotIndex.add(1));
        increaseAllottedGGPBalance(lotGgpAmount);
        // Emit lot created event
        emit LotCreated(lotIndex, msg.sender, lotGgpAmount, block.timestamp);
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
        // Check lot has GGP remaining
        uint256 remainingGgpAmount = getLotRemainingGGPAmount(_lotIndex);
        require(remainingGgpAmount > 0, "Lot GGP allocation has been exhausted");
        // Calculate the bid amount
        uint256 bidAmount = msg.value;
        uint256 maximumBidAmount = remainingGgpAmount.mul(getLotPriceAtCurrentBlock(_lotIndex)).div(calcBase);
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

    // Claim GGP from a lot
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
        require(bidAmount > 0, "Address has no GGP to claim");
        // Calculate current lot price
        uint256 currentPrice;
        if (bidPrice > blockPrice) { currentPrice = bidPrice; }
        else { currentPrice = blockPrice; }
        // Calculate GGP claim amount
        uint256 ggpAmount = calcBase.mul(bidAmount).div(currentPrice);
        // Due to integer arithmetic, there may be a tiny bit less than calculated
        uint256 allottedAmount = getAllottedGGPBalance();
        if (ggpAmount > allottedAmount) {
            ggpAmount = allottedAmount;
        }
        // Transfer GGP to bidder
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawToken(msg.sender, IERC20(getContractAddress("gogoTokenGGP")), ggpAmount);
        // Decrease allotted GGP balance & update address bid amount
        decreaseAllottedGGPBalance(ggpAmount);
        setLotAddressBidAmount(_lotIndex, msg.sender, 0);
        // Emit bid claimed event
        emit BidClaimed(_lotIndex, msg.sender, bidAmount, ggpAmount, block.timestamp);
    }

    // Recover unclaimed GGP from a lot
    function recoverUnclaimedGGP(uint256 _lotIndex) override external onlyLatestContract("rocketAuctionManager", address(this)) {
        // Check lot exists and has not already had GGP recovered
        require(getLotExists(_lotIndex), "Lot does not exist");
        require(!getLotGGPRecovered(_lotIndex), "Unclaimed GGP has already been recovered from the lot");
        // Check GGP can be reclaimed from lot
        require(block.number >= getLotEndBlock(_lotIndex), "Lot bidding period has not concluded yet");
        // Get & check remaining GGP amount
        uint256 remainingGgpAmount = getLotRemainingGGPAmount(_lotIndex);
        require(remainingGgpAmount > 0, "No unclaimed GGP is available to recover");
        // Decrease allotted GGP balance & set GGP recovered status
        decreaseAllottedGGPBalance(remainingGgpAmount);
        setLotGGPRecovered(_lotIndex, true);
        // Emit GGP recovered event
        emit GGPRecovered(_lotIndex, msg.sender, remainingGgpAmount, block.timestamp);
    }

}
