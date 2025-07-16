// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../../../types/MinipoolDeposit.sol";

/// @notice Network minipool settings
contract RocketDAOProtocolSettingsMinipool is RocketDAOProtocolSettings, RocketDAOProtocolSettingsMinipoolInterface {

    uint256 constant internal minipoolUserDistributeWindowStart = 90 days;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "minipool") {
        version = 4;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("minipool.submit.withdrawable.enabled", false);
            setSettingBool("minipool.bond.reduction.enabled", false);
            setSettingUint("minipool.launch.timeout", 72 hours);
            setSettingUint("minipool.maximum.count", 14);
            setSettingUint("minipool.user.distribute.window.length", 2 days);
            setSettingUint("minipool.maximum.penalty.count", 2500);                 // Max number of penalties oDAO can apply in rolling 1 week window (RPIP-52)
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(abi.encodePacked(_settingPath));
            if(settingKey == keccak256(abi.encodePacked("minipool.launch.timeout"))) {
                RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
                require(_value >= (rocketDAONodeTrustedSettingsMinipool.getScrubPeriod() + 1 hours), "Launch timeout must be greater than scrub period");
                // >= 12 hours (RPIP-33)
                require(_value >= 12 hours, "Launch timeout must be greater than 12 hours");
            } else if(settingKey == keccak256(abi.encodePacked("minipool.maximum.penalty.count"))) {
                // >= 2500 (RPIP-52)
                require(_value >= 2500, "Maximum penalty count must be equal or greater than 2500");
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice Returns the balance required to launch minipool
    function getLaunchBalance() override public pure returns (uint256) {
        return 32 ether;
    }

    /// @notice Returns the value required to pre-launch a minipool
    function getPreLaunchValue() override public pure returns (uint256) {
        return 1 ether;
    }

    /// @notice Returns the deposit amount for a given deposit type (only used for legacy minipool types)
    function getDepositUserAmount(MinipoolDeposit _depositType) override public pure returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositUserAmount(); }
        return 0;
    }

    /// @notice Returns the user amount for a "Full" deposit minipool
    function getFullDepositUserAmount() override public pure returns (uint256) {
        return getLaunchBalance() / 2;
    }

    /// @notice Returns the user amount for a "Half" deposit minipool
    function getHalfDepositUserAmount() override public pure returns (uint256) {
        return getLaunchBalance() / 2;
    }

    /// @notice Returns the amount a "Variable" minipool requires to move to staking status
    function getVariableDepositAmount() override external pure returns (uint256) {
        return getLaunchBalance() - getPreLaunchValue();
    }

    /// @notice Submit minipool withdrawable events currently enabled (trusted nodes only)
    function getSubmitWithdrawableEnabled() override external view returns (bool) {
        return getSettingBool("minipool.submit.withdrawable.enabled");
    }

    /// @notice Returns true if bond reductions are currentl enabled
    function getBondReductionEnabled() override external view returns (bool) {
        return getSettingBool("minipool.bond.reduction.enabled");
    }

    /// @notice Returns the timeout period in seconds for prelaunch minipools to launch
    function getLaunchTimeout() override external view returns (uint256) {
        return getSettingUint("minipool.launch.timeout");
    }

    /// @notice Returns the maximum number of minipools allowed at one time
    function getMaximumCount() override external view returns (uint256) {
      return getSettingUint("minipool.maximum.count");
    }

    /// @notice Returns true if the given time is within the user distribute window
    function isWithinUserDistributeWindow(uint256 _time) override external view returns (bool) {
        uint256 start = getUserDistributeWindowStart();
        uint256 length = getUserDistributeWindowLength();
        return (_time >= start && _time < (start + length));
    }

    /// @notice Returns true if the given time has passed the distribute window
    function hasUserDistributeWindowPassed(uint256 _time) override external view returns (bool) {
        uint256 start = getUserDistributeWindowStart();
        uint256 length = getUserDistributeWindowLength();
        return _time >= start + length;
    }

    /// @notice Returns the start of the user distribute window
    function getUserDistributeWindowStart() override public pure returns (uint256) {
        return minipoolUserDistributeWindowStart;
    }

    /// @notice Returns the length of the user distribute window
    function getUserDistributeWindowLength() override public view returns (uint256) {
        return getSettingUint("minipool.user.distribute.window.length");
    }

    /// @notice Returns the maximum number of penalties the oDAO can apply in a rolling 1 week window
    function getMaximumPenaltyCount() override external view returns (uint256) {
        return getSettingUint("minipool.maximum.penalty.count");
    }

}
