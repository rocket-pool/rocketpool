pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";


// The Trusted Node DAO Minipool settings
contract RocketDAONodeTrustedSettingsMinipool is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsMinipoolInterface {

    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "minipool") {
        // Set version
        version = 1;

        // If deployed during initial deployment, initialise now (otherwise must be called after upgrade)
        if (!_rocketStorageAddress.getDeployedStatus()){
            initialise();
        }
    }


    // Initialise
    function initialise() public {
        // Initialize settings on deployment
        require(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed"))), "Already initialised");
        // Init settings
        setSettingUint("minipool.scrub.period", 12 hours);
        setSettingUint("minipool.scrub.quorum", 0.51 ether);
        // Settings initialised
        setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
    }


    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAONodeTrustedProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("minipool.scrub.period"))) {
                RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
                require(_value <= (rocketDAOProtocolSettingsMinipool.getLaunchTimeout().sub(1 hours)), "Scrub period must be less than launch timeout");
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    // Getters

    // How long minipools must wait before moving to staking status (can be scrubbed by ODAO before then)
    function getScrubPeriod() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.period");
    }

    // The required number of trusted nodes to vote to scrub a minipool
    function getScrubQuorum() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.quorum");
    }

}
