pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketAuctionSettingsInterface.sol";

// Network auction settings

contract RocketAuctionSettings is RocketBase, RocketAuctionSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.auction.init")) {
            // Apply settings
            setCreateLotEnabled(true);
            setBidOnLotEnabled(true);
            setLotMinimumEthValue(1 ether);
            setLotMaximumEthValue(10 ether);
            setLotDuration(40320); // 7 days
            setStartingPriceRatio(1 ether); // 100%
            setReservePriceRatio(0.5 ether); // 50%
            // Settings initialized
            setBoolS("settings.auction.init", true);
        }
    }

    // Lot creation currently enabled
    function getCreateLotEnabled() override public view returns (bool) {
        return getBoolS("settings.auction.lot.create.enabled");
    }
    function setCreateLotEnabled(bool _value) public onlyGuardian {
        setBoolS("settings.auction.lot.create.enabled", _value);
    }

    // Bidding on lots currently enabled
    function getBidOnLotEnabled() override public view returns (bool) {
        return getBoolS("settings.auction.lot.bidding.enabled");
    }
    function setBidOnLotEnabled(bool _value) public onlyGuardian {
        setBoolS("settings.auction.lot.bidding.enabled", _value);
    }

    // The minimum lot size relative to ETH value
    function getLotMinimumEthValue() override public view returns (uint256) {
        return getUintS("settings.auction.lot.value.minimum");
    }
    function setLotMinimumEthValue(uint256 _value) public onlyGuardian {
        setUintS("settings.auction.lot.value.minimum", _value);
    }

    // The maximum lot size relative to ETH value
    function getLotMaximumEthValue() override public view returns (uint256) {
        return getUintS("settings.auction.lot.value.maximum");
    }
    function setLotMaximumEthValue(uint256 _value) public onlyGuardian {
        setUintS("settings.auction.lot.value.maximum", _value);
    }

    // The maximum auction duration in blocks
    function getLotDuration() override public view returns (uint256) {
        return getUintS("settings.auction.lot.duration");
    }
    function setLotDuration(uint256 _value) public onlyGuardian {
        setUintS("settings.auction.lot.duration", _value);
    }

    // The starting price relative to current RPL price, as a fraction of 1 ether
    function getStartingPriceRatio() override public view returns (uint256) {
        return getUintS("settings.auction.price.start");
    }
    function setStartingPriceRatio(uint256 _value) public onlyGuardian {
        setUintS("settings.auction.price.start", _value);
    }

    // The reserve price relative to current RPL price, as a fraction of 1 ether
    function getReservePriceRatio() override public view returns (uint256) {
        return getUintS("settings.auction.price.reserve");
    }
    function setReservePriceRatio(uint256 _value) public onlyGuardian {
        setUintS("settings.auction.price.reserve", _value);
    }

}
