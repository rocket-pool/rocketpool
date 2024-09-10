// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";

/// @notice Network minipool settings
contract RocketDAOProtocolSettingsMegapool is RocketDAOProtocolSettings, RocketDAOProtocolSettingsMegapoolInterface {


    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "minipool") {
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice 
    function getUnstakingPeriod() override external view returns (uint256) {
        return getSettingUint("megapool.unstaking.period");
    }

}
