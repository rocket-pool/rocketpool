// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";


/// @notice The Trusted Node DAO Minipool settings
contract RocketDAONodeTrustedSettingsMinipool is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsMinipoolInterface {

    using SafeMath for uint;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "minipool") {
        // Set version
        version = 2;

        // If deployed during initial deployment, initialise now (otherwise must be called after upgrade)
        if (!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("minipool.scrub.period", 12 hours);
            setSettingUint("minipool.promotion.scrub.period", 3 days);
            setSettingUint("minipool.scrub.quorum", 0.51 ether);
            setSettingBool("minipool.scrub.penalty.enabled", false);
            setSettingUint("minipool.bond.reduction.window.start", 2 days);
            setSettingUint("minipool.bond.reduction.window.length", 2 days);
            setSettingUint("minipool.cancel.bond.reduction.quorum", 0.51 ether);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
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

    /// @notice How long minipools must wait before moving to staking status (can be scrubbed by ODAO before then)
    function getScrubPeriod() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.period");
    }

    /// @notice How long minipools must wait before promoting a vacant minipool to staking status (can be scrubbed by ODAO before then)
    function getPromotionScrubPeriod() override external view returns (uint256) {
        return getSettingUint("minipool.promotion.scrub.period");
    }

    /// @notice Returns the required number of trusted nodes to vote to scrub a minipool
    function getScrubQuorum() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.quorum");
    }

    /// @notice Returns the required number of trusted nodes to vote to cancel a bond reduction
    function getCancelBondReductionQuorum() override external view returns (uint256) {
        return getSettingUint("minipool.cancel.bond.reduction.quorum");
    }

    /// @notice Returns true if scrubbing results in an RPL penalty for the node operator
    function getScrubPenaltyEnabled() override external view returns (bool) {
        return getSettingBool("minipool.scrub.penalty.enabled");
    }

    /// @notice Returns true if the given time is within the bond reduction window
    function isWithinBondReductionWindow(uint256 _time) override external view returns (bool) {
        uint256 start = getBondReductionWindowStart();
        uint256 length = getBondReductionWindowLength();
        return (_time >= start && _time < (start.add(length)));
    }

    /// @notice Returns the start of the bond reduction window
    function getBondReductionWindowStart() override public view returns (uint256) {
        return getSettingUint("minipool.bond.reduction.window.start");
    }

    /// @notice Returns the length of the bond reduction window
    function getBondReductionWindowLength() override public view returns (uint256) {
        return getSettingUint("minipool.bond.reduction.window.length");
    }
}
