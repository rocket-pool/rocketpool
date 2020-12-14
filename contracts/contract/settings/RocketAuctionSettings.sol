pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketAuctionSettingsInterface.sol";

// Network auction settings

contract RocketAuctionSettings is RocketBase, RocketAuctionSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.auction.init")) {
            // Apply settings
            setStartEnabled(true);
            setMaximumLotEthValue(10 ether);
            setStartingPriceRatio(1 ether); // 100%
            setReservePriceRatio(0.5 ether); // 50%
            setDuration(40320); // 7 days
            // Settings initialized
            setBoolS("settings.auction.init", true);
        }
    }

    // Auction starting currently enabled
    function getStartEnabled() override public view returns (bool) {
        return getBoolS("settings.auction.start.enabled");
    }
    function setStartEnabled(bool _value) public onlyOwner {
        setBoolS("settings.auction.start.enabled", _value);
    }

    // The maximum lot size relative to ETH value
    function getMaximumLotEthValue() override public view returns (uint256) {
        return getUintS("settings.auction.lot.value.maximum");
    }
    function setMaximumLotEthValue(uint256 _value) public onlyOwner {
        setUintS("settings.auction.lot.value.maximum", _value);
    }

    // The starting price relative to current RPL price, as a fraction of 1 ether
    function getStartingPriceRatio() override public view returns (uint256) {
        return getUintS("settings.auction.price.start");
    }
    function setStartingPriceRatio(uint256 _value) public onlyOwner {
        setUintS("settings.auction.price.start", _value);
    }

    // The reserve price relative to current RPL price, as a fraction of 1 ether
    function getReservePriceRatio() override public view returns (uint256) {
        return getUintS("settings.auction.price.reserve");
    }
    function setReservePriceRatio(uint256 _value) public onlyOwner {
        setUintS("settings.auction.price.reserve", _value);
    }

    // The maximum auction duration in blocks
    function getDuration() override public view returns (uint256) {
        return getUintS("settings.auction.duration");
    }
    function setDuration(uint256 _value) public onlyOwner {
        setUintS("settings.auction.duration", _value);
    }

}
