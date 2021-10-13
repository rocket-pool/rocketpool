pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";


// The Trusted Node DAO Minipool settings
contract RocketDAONodeTrustedSettingsMinipool is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsMinipoolInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "minipool") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("minipool.scrub.period", 12 hours);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

  
    // Getters

    // How long minipools must wait before moving to staking status (can be scrubbed by ODAO before then)
    function getScrubPeriod() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.period");
    }

}
