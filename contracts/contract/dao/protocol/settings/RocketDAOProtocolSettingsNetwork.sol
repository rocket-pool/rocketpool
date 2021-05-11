pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

// Network auction settings

contract RocketDAOProtocolSettingsNetwork is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNetworkInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "network") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingUint("network.consensus.threshold", 0.51 ether);      // 51%
            setSettingBool("network.submit.balances.enabled", true);
            setSettingUint("network.submit.balances.frequency", 5760);      // ~24 hours
            setSettingBool("network.submit.prices.enabled", true);
            setSettingUint("network.submit.prices.frequency", 5760);        // ~24 hours
            setSettingBool("network.process.withdrawals.enabled", true);
            setSettingUint("network.node.fee.minimum", 0.05 ether);         // 5%
            setSettingUint("network.node.fee.target", 0.10 ether);          // 10%
            setSettingUint("network.node.fee.maximum", 0.20 ether);         // 20%
            setSettingUint("network.node.fee.demand.range", 1000 ether);
            setSettingUint("network.reth.collateral.target", 0.1 ether);   
            // Settings initialized
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // The threshold of trusted nodes that must reach consensus on oracle data to commit it
    function getNodeConsensusThreshold() override public view returns (uint256) {
        return getSettingUint("network.consensus.threshold");
    }

    // Submit balances currently enabled (trusted nodes only)
    function getSubmitBalancesEnabled() override public view returns (bool) {
        return getSettingBool("network.submit.balances.enabled");
    }

    // The frequency in blocks at which network balances should be submitted by trusted nodes
    function getSubmitBalancesFrequency() override public view returns (uint256) {
        return getSettingUint("network.submit.balances.frequency");
    }

    // Submit prices currently enabled (trusted nodes only)
    function getSubmitPricesEnabled() override public view returns (bool) {
        return getSettingBool("network.submit.prices.enabled");
    }

    // The frequency in blocks at which network prices should be submitted by trusted nodes
    function getSubmitPricesFrequency() override public view returns (uint256) {
        return getSettingUint("network.submit.prices.frequency");
    }

    // Process withdrawals currently enabled (trusted nodes only)
    function getProcessWithdrawalsEnabled() override public view returns (bool) {
        return getSettingBool("network.process.withdrawals.enabled");
    }

    // The minimum node commission rate as a fraction of 1 ether
    function getMinimumNodeFee() override public view returns (uint256) {
        return getSettingUint("network.node.fee.minimum");
    }

    // The target node commission rate as a fraction of 1 ether
    function getTargetNodeFee() override public view returns (uint256) {
        return getSettingUint("network.node.fee.target");
    }

    // The maximum node commission rate as a fraction of 1 ether
    function getMaximumNodeFee() override public view returns (uint256) {
        return getSettingUint("network.node.fee.maximum");
    }

    // The range of node demand values to base fee calculations on (from negative to positive value)
    function getNodeFeeDemandRange() override public view returns (uint256) {
        return getSettingUint("network.node.fee.demand.range");
    }

    // Target rETH collateralization rate as a fraction of 1 ether
    function getTargetRethCollateralRate() override public view returns (uint256) {
        return getSettingUint("network.reth.collateral.target");
    }
}
