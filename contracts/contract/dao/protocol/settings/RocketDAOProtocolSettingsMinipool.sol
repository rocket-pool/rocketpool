pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../../../types/MinipoolDeposit.sol";

// Network minipool settings
contract RocketDAOProtocolSettingsMinipool is RocketDAOProtocolSettings, RocketDAOProtocolSettingsMinipoolInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "minipool") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("minipool.submit.withdrawable.enabled", false);
            setSettingUint("minipool.launch.timeout", 5760);                // ~24 hours
            setSettingUint("minipool.scrub.period", 24 hours);
            setSettingUint("minipool.maximum.count", 14);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // Balance required to launch minipool
    function getLaunchBalance() override public pure returns (uint256) {
        return 32 ether;
    }

    // Required node deposit amounts
    function getDepositNodeAmount(MinipoolDeposit _depositType) override external pure returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositNodeAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositNodeAmount(); }
        if (_depositType == MinipoolDeposit.Empty) { return getEmptyDepositNodeAmount(); }
        return 0;
    }
    function getFullDepositNodeAmount() override public pure returns (uint256) {
        return getLaunchBalance();
    }
    function getHalfDepositNodeAmount() override public pure returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getEmptyDepositNodeAmount() override public pure returns (uint256) {
        return 0 ether;
    }

    // Required user deposit amounts
    function getDepositUserAmount(MinipoolDeposit _depositType) override external pure returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Empty) { return getEmptyDepositUserAmount(); }
        return 0;
    }
    function getFullDepositUserAmount() override public pure returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getHalfDepositUserAmount() override public pure returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getEmptyDepositUserAmount() override public pure returns (uint256) {
        return getLaunchBalance();
    }

    // Submit minipool withdrawable events currently enabled (trusted nodes only)
    function getSubmitWithdrawableEnabled() override external view returns (bool) {
        return getSettingBool("minipool.submit.withdrawable.enabled");
    }

    // Timeout period in blocks for prelaunch minipools to launch
    function getLaunchTimeout() override external view returns (uint256) {
        return getSettingUint("minipool.launch.timeout");
    }

    // How long minipools must wait before moving to staking status (can be scrubbed by ODAO before then)
    function getScrubPeriod() override external view returns (uint256) {
        return getSettingUint("minipool.scrub.period");
    }

    // Maximum number of minipools allowed at one time
    function getMaximumCount() override external view returns (uint256) {
      return getSettingUint("minipool.maximum.count");
    }

}
