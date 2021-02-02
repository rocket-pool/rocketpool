pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAONetworkSettings.sol";
import "../../../../interface/dao/network/settings/RocketDAONetworkSettingsAuctionInterface.sol";

// Network auction settings

contract RocketDAONetworkSettingsAuction is RocketDAONetworkSettings, RocketDAONetworkSettingsAuctionInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketDAONetworkSettings(_rocketStorageAddress, "auction") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("auction.lot.create.enabled", true);      
            setSettingBool("auction.lot.bidding.enabled", true);
            setSettingUint("auction.lot.value.minimum", 1 ether);   
            setSettingUint("auction.lot.value.maximum", 10 ether);
            setSettingUint("auction.lot.duration", 40320);          // 7 days
            setSettingUint("auction.price.start", 1 ether);         // 100%
            setSettingUint("auction.price.reserve", 0.5 ether);     // 50%
            // Settings initialized
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }


    // Lot creation currently enabled
    function getCreateLotEnabled() override public view returns (bool) {
        return getSettingBool("auction.lot.create.enabled");
    }

    // Bidding on lots currently enabled
    function getBidOnLotEnabled() override public view returns (bool) {
        return getSettingBool("auction.lot.bidding.enabled");
    }

    // The minimum lot size relative to ETH value
    function getLotMinimumEthValue() override public view returns (uint256) {
        return getSettingUint("auction.lot.value.minimum");
    }

    // The maximum lot size relative to ETH value
    function getLotMaximumEthValue() override public view returns (uint256) {
        return getSettingUint("auction.lot.value.maximum");
    }

    // The maximum auction duration in blocks
    function getLotDuration() override public view returns (uint256) {
        return getSettingUint("auction.lot.duration");
    }

    // The starting price relative to current RPL price, as a fraction of 1 ether
    function getStartingPriceRatio() override public view returns (uint256) {
        return getSettingUint("auction.price.start");
    }

    // The reserve price relative to current RPL price, as a fraction of 1 ether
    function getReservePriceRatio() override public view returns (uint256) {
        return getSettingUint("auction.price.reserve");
    }

}
