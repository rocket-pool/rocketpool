pragma solidity 0.8.18;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

// Network auction settings

contract RocketDAOProtocolSettingsNetwork is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNetworkInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "network") {
        // Set version
        version = 3;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingUint("network.consensus.threshold", 0.51 ether);      // 51%
            setSettingBool("network.submit.balances.enabled", true);
            setSettingUint("network.submit.balances.frequency", 1 days);    
            setSettingBool("network.submit.prices.enabled", true);
            setSettingUint("network.submit.prices.frequency", 1 days);      
            setSettingUint("network.node.fee.minimum", 0.15 ether);         // 15%
            setSettingUint("network.node.fee.target", 0.15 ether);          // 15%
            setSettingUint("network.node.fee.maximum", 0.15 ether);         // 15%
            setSettingUint("network.node.fee.demand.range", 160 ether);
            setSettingUint("network.reth.collateral.target", 0.1 ether);
            setSettingUint("network.penalty.threshold", 0.51 ether);       // Consensus for penalties requires 51% vote
            setSettingUint("network.penalty.per.rate", 0.1 ether);         // 10% per penalty
            setSettingBool("network.submit.rewards.enabled", true);        // Enable reward submission
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        bytes32 settingKey = keccak256(bytes(_settingPath));
        if(settingKey == keccak256(bytes("network.consensus.threshold"))) {
            require(_value >= 0.51 ether, "Consensus threshold must be 51% or higher");
        } else if(settingKey == keccak256(bytes("network.node.fee.minimum"))) {
            require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee minimum must be a value between 5% and 20%");
        } else if(settingKey == keccak256(bytes("network.node.fee.target"))) {
            require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee target must be a value between 5% and 20%");
        } else if(settingKey == keccak256(bytes("network.node.fee.maximum"))) {
            require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee maximum must be a value between 5% and 20%");
        } else if(settingKey == keccak256(bytes("network.submit.balances.frequency"))) {
            require(_value >= 1 hours, "The submit frequency must be >= 1 hour");
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice The threshold of trusted nodes that must reach consensus on oracle data to commit it
    function getNodeConsensusThreshold() override external view returns (uint256) {
        return getSettingUint("network.consensus.threshold");
    }

    /// @notice The threshold of trusted nodes that must reach consensus on a penalty
    function getNodePenaltyThreshold() override external view returns (uint256) {
        return getSettingUint("network.penalty.threshold");
    }

    /// @notice The amount to penalise a minipool for each feeDistributor infraction
    function getPerPenaltyRate() override external view returns (uint256) {
        return getSettingUint("network.penalty.per.rate");
    }

    /// @notice Submit balances currently enabled (trusted nodes only)
    function getSubmitBalancesEnabled() override external view returns (bool) {
        return getSettingBool("network.submit.balances.enabled");
    }

    /// @notice The frequency in seconds at which network balances should be submitted by trusted nodes
    function getSubmitBalancesFrequency() override external view returns (uint256) {
        return getSettingUint("network.submit.balances.frequency");
    }

    /// @notice Submit prices currently enabled (trusted nodes only)
    function getSubmitPricesEnabled() override external view returns (bool) {
        return getSettingBool("network.submit.prices.enabled");
    }

    /// @notice The frequency in seconds at which network prices should be submitted by trusted nodes
    function getSubmitPricesFrequency() override external view returns (uint256) {
        return getSettingUint("network.submit.prices.frequency");
    }

    /// @notice The minimum node commission rate as a fraction of 1 ether
    function getMinimumNodeFee() override external view returns (uint256) {
        return getSettingUint("network.node.fee.minimum");
    }

    /// @notice The target node commission rate as a fraction of 1 ether
    function getTargetNodeFee() override external view returns (uint256) {
        return getSettingUint("network.node.fee.target");
    }

    /// @notice The maximum node commission rate as a fraction of 1 ether
    function getMaximumNodeFee() override external view returns (uint256) {
        return getSettingUint("network.node.fee.maximum");
    }

    /// @notice The range of node demand values to base fee calculations on (from negative to positive value)
    function getNodeFeeDemandRange() override external view returns (uint256) {
        return getSettingUint("network.node.fee.demand.range");
    }

    /// @notice Target rETH collateralization rate as a fraction of 1 ether
    function getTargetRethCollateralRate() override external view returns (uint256) {
        return getSettingUint("network.reth.collateral.target");
    }

    /// @notice rETH withdraw delay in blocks
    function getRethDepositDelay() override external view returns (uint256) {
        return getSettingUint("network.reth.deposit.delay");
    }

    /// @notice Submit reward snapshots currently enabled (trusted nodes only)
    function getSubmitRewardsEnabled() override external view returns (bool) {
        return getSettingBool("network.submit.rewards.enabled");
    }
}
