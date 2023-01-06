pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../../../types/MinipoolDeposit.sol";
import "../../../../contracts/contract/minipool/RocketMinipoolDelegate.sol";

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
            setSettingUint("minipool.launch.timeout", 72 hours);
            setSettingUint("minipool.maximum.count", 14);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("minipool.launch.timeout"))) {
                RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
                require(_value >= (rocketDAONodeTrustedSettingsMinipool.getScrubPeriod().add(1 hours)), "Launch timeout must be greater than scrub period");
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    // Balance required to launch minipool
    function getLaunchBalance() override public pure returns (uint256) {
        return 32 ether;
    }

    // Required node deposit amounts
    function getFullDepositNodeAmount() override public pure returns (uint256) {
        return getLaunchBalance();
    }
    function getHalfDepositNodeAmount() override public pure returns (uint256) {
        return getLaunchBalance().div(2);
    }

    // Required user deposit amounts
    function getDepositUserAmount(MinipoolDeposit _depositType) override external pure returns (uint256) {
        if (_depositType == MinipoolDeposit.Efficient) { return getEfficientDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Full) { return getFullDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Half) { return getHalfDepositUserAmount(); }
        if (_depositType == MinipoolDeposit.Empty) { return getEmptyDepositUserAmount(); }
        return 0;
    }
    function getEfficientDepositUserAmount() override public pure returns (uint256) {
        address delegateAddress = getContractAddress("rocketMinipoolDelegate");
        return getLaunchBalance().sub(delegateAddress.efficientprelaunchAmount);
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

    // Timeout period in seconds for prelaunch minipools to launch
    function getLaunchTimeout() override external view returns (uint256) {
        return getSettingUint("minipool.launch.timeout");
    }

    // Maximum number of minipools allowed at one time
    function getMaximumCount() override external view returns (uint256) {
      return getSettingUint("minipool.maximum.count");
    }

}
