pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";

// Network settings

contract RocketNetworkSettings is RocketBase, RocketNetworkSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.network.init")) {
            // Apply settings
            setNodeConsensusThreshold(0.51 ether); // 51%
            setSubmitBalancesEnabled(true);
            setProcessWithdrawalsEnabled(true);
            setMinimumNodeFee(0.05 ether); // 5%
            setTargetNodeFee(0.10 ether); // 10%
            setMaximumNodeFee(0.20 ether); // 20%
            setNodeFeeDemandRange(1000 ether);
            setTargetRethCollateralRate(0.1 ether); // 10%
            // Settings initialized
            setBoolS("settings.network.init", true);
        }
    }

    // The threshold of trusted nodes that must reach consensus on oracle data to commit it
    function getNodeConsensusThreshold() override public view returns (uint256) {
        return getUintS("settings.network.consensus.threshold");
    }
    function setNodeConsensusThreshold(uint256 _value) public onlySuperUser {
        setUintS("settings.network.consensus.threshold", _value);
    }

    // Submit ETH balances currently enabled (trusted nodes only)
    function getSubmitBalancesEnabled() override public view returns (bool) {
        return getBoolS("settings.network.submit.balances.enabled");
    }
    function setSubmitBalancesEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.network.submit.balances.enabled", _value);
    }

    // Process withdrawals currently enabled (trusted nodes only)
    function getProcessWithdrawalsEnabled() override public view returns (bool) {
        return getBoolS("settings.network.process.withdrawals.enabled");
    }
    function setProcessWithdrawalsEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.network.process.withdrawals.enabled", _value);
    }

    // The minimum node commission rate as a fraction of 1 ether
    function getMinimumNodeFee() override public view returns (uint256) {
        return getUintS("settings.network.node.fee.minimum");
    }
    function setMinimumNodeFee(uint256 _value) public onlySuperUser {
        setUintS("settings.network.node.fee.minimum", _value);
    }

    // The target node commission rate as a fraction of 1 ether
    function getTargetNodeFee() override public view returns (uint256) {
        return getUintS("settings.network.node.fee.target");
    }
    function setTargetNodeFee(uint256 _value) public onlySuperUser {
        setUintS("settings.network.node.fee.target", _value);
    }

    // The maximum node commission rate as a fraction of 1 ether
    function getMaximumNodeFee() override public view returns (uint256) {
        return getUintS("settings.network.node.fee.maximum");
    }
    function setMaximumNodeFee(uint256 _value) public onlySuperUser {
        setUintS("settings.network.node.fee.maximum", _value);
    }

    // The range of node demand values to base fee calculations on (from negative to positive value)
    function getNodeFeeDemandRange() override public view returns (uint256) {
        return getUintS("settings.network.node.fee.demand.range");
    }
    function setNodeFeeDemandRange(uint256 _value) public onlySuperUser {
        setUintS("settings.network.node.fee.demand.range", _value);
    }

    // Target rETH collateralization rate as a fraction of 1 ether
    function getTargetRethCollateralRate() override public view returns (uint256) {
        return getUintS("settings.network.reth.collateral.target");
    }
    function setTargetRethCollateralRate(uint256 _value) public onlySuperUser {
        setUintS("settings.network.reth.collateral.target", _value);
    }

}
