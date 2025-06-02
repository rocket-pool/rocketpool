// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsAuctionInterface.sol";

/// @notice Network auction settings
contract RocketDAOProtocolSettingsAuction is RocketDAOProtocolSettings, RocketDAOProtocolSettingsAuctionInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "auction") {
        version = 3;
        // Initialise settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("auction.lot.create.enabled", true);      
            setSettingBool("auction.lot.bidding.enabled", true);
            setSettingUint("auction.lot.value.minimum", 1 ether);   
            setSettingUint("auction.lot.value.maximum", 10 ether);
            setSettingUint("auction.lot.duration", 50400);          // 7 days
            setSettingUint("auction.price.start", 1 ether);         // 100%
            setSettingUint("auction.price.reserve", 0.5 ether);     // 50%
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @dev Overrides inherited setting method with extra sanity checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(abi.encodePacked(_settingPath));
            if(settingKey == keccak256(abi.encodePacked("auction.lot.value.minimum"))) {
                // >= 1 RPL (RPIP-33)
                require(_value >= 1 ether, "Value must be >= 1 RPL");
            } else if(settingKey == keccak256(abi.encodePacked("auction.lot.value.maximum"))) {
                // >= 1 RPL (RPIP-33)
                require(_value >= 1 ether, "Value must be >= 1 RPL");
            } else if(settingKey == keccak256(abi.encodePacked("auction.lot.duration"))) {
                // >= 1 day (RPIP-33) (approximated by blocks)
                require(_value >= 7200, "Value must be >= 7200");
            } else if(settingKey == keccak256(abi.encodePacked("auction.price.start"))) {
                // >= 10% (RPIP-33)
                require(_value >= 0.1 ether, "Value must be >= 10%");
            } else if(settingKey == keccak256(abi.encodePacked("auction.price.reserve"))) {
                // >= 10% (RPIP-33)
                require(_value >= 0.1 ether, "Value must be >= 10%");
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice Lot creation currently enabled
    function getCreateLotEnabled() override external view returns (bool) {
        return getSettingBool("auction.lot.create.enabled");
    }

    /// @notice Bidding on lots currently enabled
    function getBidOnLotEnabled() override external view returns (bool) {
        return getSettingBool("auction.lot.bidding.enabled");
    }

    /// @notice The minimum lot size relative to ETH value
    function getLotMinimumEthValue() override external view returns (uint256) {
        return getSettingUint("auction.lot.value.minimum");
    }

    /// @notice The maximum lot size relative to ETH value
    function getLotMaximumEthValue() override external view returns (uint256) {
        return getSettingUint("auction.lot.value.maximum");
    }

    /// @notice The maximum auction duration in blocks
    function getLotDuration() override external view returns (uint256) {
        return getSettingUint("auction.lot.duration");
    }

    /// @notice The starting price relative to current RPL price, as a fraction of 1 ether
    function getStartingPriceRatio() override external view returns (uint256) {
        return getSettingUint("auction.price.start");
    }

    /// @notice The reserve price relative to current RPL price, as a fraction of 1 ether
    function getReservePriceRatio() override external view returns (uint256) {
        return getSettingUint("auction.price.reserve");
    }

}
