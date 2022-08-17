pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsRewardsInterface.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";


// The Trusted Node DAO Rewards settings

contract RocketDAONodeTrustedSettingsRewards is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsRewardsInterface {

    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "rewards") {
        // Set version
        version = 2;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingBool("rewards.network.enabled", true);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingBool(string memory _settingPath, bool _value) override public onlyDAONodeTrustedProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // oDAO should never disable main net rewards
            if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("rewards.network.enabled", uint256(0)))) {
                revert("Cannot disable network 0");
            }
        }
        // Update setting now
        setBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }


    // Getters

    function getNetworkEnabled(uint256 _network) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked(settingNameSpace, "rewards.network.enabled", _network)));
    }
}
