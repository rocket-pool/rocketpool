pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../types/MinipoolDeposit.sol";

// Network minipool settings

contract RocketMinipoolSettings is RocketBase, RocketMinipoolSettingsInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.minipool.init")) {
            // Apply settings
            setSubmitWithdrawableEnabled(true);
            setLaunchTimeout(5760); // ~24 hours
            setWithdrawalDelay(172800); // ~30 days
            // Settings initialized
            setBoolS("settings.minipool.init", true);
        }
    }

    // Balance required to launch minipool
    function getLaunchBalance() override public view returns (uint256) {
        return 32 ether;
    }

    // Required node deposit amounts
    function getDepositNodeAmount(MinipoolDeposit _depositType) override public view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositNodeAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositNodeAmount(); }
        if (_depositType == MinipoolDeposit.Empty) { return getEmptyDepositNodeAmount(); }
        return 0;
    }
    function getFullDepositNodeAmount() override public view returns (uint256) {
        return getLaunchBalance();
    }
    function getHalfDepositNodeAmount() override public view returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getEmptyDepositNodeAmount() override public view returns (uint256) {
        return 0 ether;
    }

    // Required user deposit amounts
    function getDepositUserAmount(MinipoolDeposit _depositType) override public view returns (uint256) {
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Empty) { return getEmptyDepositUserAmount(); }
        return 0;
    }
    function getFullDepositUserAmount() override public view returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getHalfDepositUserAmount() override public view returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getEmptyDepositUserAmount() override public view returns (uint256) {
        return getLaunchBalance();
    }

    // Submit minipool withdrawable events currently enabled (trusted nodes only)
    function getSubmitWithdrawableEnabled() override public view returns (bool) {
        return getBoolS("settings.minipool.submit.withdrawable.enabled");
    }
    function setSubmitWithdrawableEnabled(bool _value) public onlyOwner {
        setBoolS("settings.minipool.submit.withdrawable.enabled", _value);
    }

    // Timeout period in blocks for prelaunch minipools to launch
    function getLaunchTimeout() override public view returns (uint256) {
        return getUintS("settings.minipool.launch.timeout");
    }
    function setLaunchTimeout(uint256 _value) public onlyOwner {
        setUintS("settings.minipool.launch.timeout", _value);
    }

    // Withdrawal delay in blocks before withdrawable minipools can be closed
    function getWithdrawalDelay() override public view returns (uint256) {
        return getUintS("settings.minipool.withdrawal.delay");
    }
    function setWithdrawalDelay(uint256 _value) public onlyOwner {
        setUintS("settings.minipool.withdrawal.delay", _value);
    }

}
