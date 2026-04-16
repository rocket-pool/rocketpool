// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketBase} from "../../../RocketBase.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";

/// @notice Network auction settings
contract RocketDAOProtocolSettingsNetwork is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNetworkInterface {
    // Modifiers
    modifier onlyAllowListedController() {
        require(isAllowListedController(msg.sender), "Not on allow list");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "network") {
        version = 5;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            // Set defaults
            _setSettingUint("network.consensus.threshold", 0.51 ether);      // 51%
            _setSettingBool("network.submit.balances.enabled", true);
            _setSettingUint("network.submit.balances.frequency", 1 days);
            _setSettingBool("network.submit.prices.enabled", true);
            _setSettingUint("network.submit.prices.frequency", 1 days);
            _setSettingUint("network.node.fee.minimum", 0.15 ether);         // 15%
            _setSettingUint("network.node.fee.target", 0.15 ether);          // 15%
            _setSettingUint("network.node.fee.maximum", 0.15 ether);         // 15%
            _setSettingUint("network.node.fee.demand.range", 160 ether);
            _setSettingUint("network.reth.collateral.target", 0.01 ether);  // 1% (RPIP-71)
            _setSettingUint("network.penalty.threshold", 0.51 ether);       // Consensus for penalties requires 51% vote
            _setSettingUint("network.penalty.per.rate", 0.1 ether);         // 10% per penalty
            _setSettingBool("network.submit.rewards.enabled", true);        // Enable reward submission
            _setSettingUint("network.node.commission.share", 0.05 ether);                        // 5% (RPIP-46)
            _setSettingUint("network.node.commission.share.security.council.adder", 0 ether);    // 0% (RPIP-46)
            _setSettingUint("network.voter.share", 0.09 ether);                                  // 9% (RPIP-46)
            _setSettingUint("network.pdao.share", 0.00 ether);                                   // 0% (RPIP-72)
            _setSettingUint("network.max.node.commission.share.council.adder", 0.01 ether);      // 1% (RPIP-46)
            _setSettingUint("network.max.reth.balance.delta", 0.02 ether);                       // 2% (RPIP-61)
            _setSettingUint("deposit.pool.collateral.target", 0.01 ether);  // 1% (RPIP-71)
            _setSettingBool("megapool.exit.phase", false);                  // false (RPIP-71)
            _setSettingUint("staking.delay", 28 days);                      // 28 days (RPIP-71)
            _setSettingUint("tournament.size", 4);                          // 4 (RPIP-71)
            _setSettingUint("network.cooperative.exit.phase", 72 hours);    // 72 hours (RPIP-80)
            _setSettingUint("network.did.not.exit.penalty", 0.1 ether);     // 0.1 ETH (RPIP-80)
            _setSettingUint("network.did.not.exit.cooldown", 28 days);      // 28 days(RPIP-80)
            _setSettingBool("network.performance.exits.enabled", true);     // true (RPIP-73)
            _setSettingUint("network.performance.period", 44032);           // ~200 days in epochs (RPIP-73)
            _setSettingUint("network.performance.proof.buffer", 225);       // 24 hours in epochs (RPIP-73)
            _setSettingUint("network.performance.threshold", 0.94 ether);   // 94% (RPIP-73)
            _setSettingUint("network.performance.challenge.period", 24 hours); // 24 hours (RPIP-73)
            // Set deploy flag
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        if (getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Some safety guards for certain settings
            bytes32 settingKey = keccak256(bytes(_settingPath));
            if (settingKey == keccak256(bytes("network.consensus.threshold"))) {
                require(_value >= 0.51 ether, "Consensus threshold must be 51% or higher");
            } else if (settingKey == keccak256(bytes("network.node.fee.minimum"))) {
                require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee minimum must be a value between 5% and 20%");
            } else if (settingKey == keccak256(bytes("network.node.fee.target"))) {
                require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee target must be a value between 5% and 20%");
            } else if (settingKey == keccak256(bytes("network.node.fee.maximum"))) {
                require(_value >= 0.05 ether && _value <= 0.2 ether, "The node fee maximum must be a value between 5% and 20%");
            } else if (settingKey == keccak256(bytes("network.submit.balances.frequency"))) {
                require(_value >= 1 hours && _value <= 7 days, "Value must be >= 1 hour & <= 7 days");
            } else if (settingKey == keccak256(bytes("network.max.reth.balance.delta"))) {
                require(_value >= 0.01 ether, "The max rETH balance delta must be >= 1%");
            } else if (settingKey == keccak256(bytes("network.reth.collateral.target"))) {
                require(_value <= 0.5 ether, "Value must be <= 50%");
            } else if (settingKey == keccak256(bytes("network.node.commission.share.security.council.adder"))) {
                return _setNodeShareSecurityCouncilAdder(_value);
            } else if (settingKey == keccak256(bytes("network.node.commission.share"))) {
                return _setNodeCommissionShare(_value);
            } else if (settingKey == keccak256(bytes("network.voter.share"))) {
                return _setVoterShare(_value);
            } else if (settingKey == keccak256(bytes("network.pdao.share"))) {
                return _setProtocolDAOShare(_value);
            } else if (settingKey == keccak256(bytes("staking.delay"))) {
                require(_value < 7 days, "Value must be < 7 days"); // RPIP-71
            } else if (settingKey == keccak256(bytes("tournament.size"))) {
                require(_value < 20, "Value must be < 20"); // RPIP-71
            } else if (settingKey == keccak256(bytes("network.did.not.exit.cooldown"))) {
                require(_value > 7 days, "Value must be > 7 days"); // RPIP-80
            } else if (settingKey == keccak256(bytes("network.performance.period"))) {
                require(_value > 0, "Value must be > 0");
            } else if (settingKey == keccak256(bytes("network.performance.proof.buffer"))) {
                require(_value > 1, "Value must be > 1");
            } else if (settingKey == keccak256(bytes("network.performance.threshold"))) {
                require(_value > 0 && _value <= 1 ether, "Value must be > 0 and <= 100%");
            } else if (settingKey == keccak256(bytes("network.performance.challenge.period"))) {
                require(_value > 0, "Value must be > 0");
            }
            // Update setting now
            _setSettingUint(_settingPath, _value);
        } else {
            // Update setting now
            _setSettingUint(_settingPath, _value);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingBool(string memory _settingPath, bool _value) override public onlyDAOProtocolProposal {
        if (getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Some safety guards for certain settings
            bytes32 settingKey = keccak256(bytes(_settingPath));
            if (settingKey == keccak256(bytes("megapool.exit.phase"))) {
                require(_value, "Value must be true"); // RPIP-71
            }
            // Update setting now
            _setSettingBool(_settingPath, _value);
        } else {
            // Update setting now
            _setSettingBool(_settingPath, _value);
        }
    }

    /// @dev Sets a namespaced uint value skipping any guardrails
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @dev Sets a namespaced bool value skipping any guardrails
    function _setSettingBool(string memory _settingPath, bool _value) internal {
        setBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    // @notice Returns the maximum value the security council can set the node share security council adder to
    function getMaxNodeShareSecurityCouncilAdder() override public view returns (uint256) {
        return getSettingUint("network.max.node.commission.share.council.adder");
    }

    // @notice Returns the current voter share (excluding security council adder)
    function getVoterShare() override public view returns (uint256) {
        return getSettingUint("network.voter.share");
    }

    // @notice Returns the current pdao share
    function getProtocolDAOShare() override public view returns (uint256) {
        return getSettingUint("network.pdao.share");
    }

    // @notice Returns the current node share (excluding security council adder)
    function getNodeShare() override public view returns (uint256) {
        return getSettingUint("network.node.commission.share");
    }

    // @notice Returns the current node share security council adder
    function getNodeShareSecurityCouncilAdder() override public view returns (uint256) {
        return getSettingUint("network.node.commission.share.security.council.adder");
    }

    // @notice Returns the current rETH commission
    function getRethCommission() override public view returns (uint256) {
        return getNodeShare() + getVoterShare() + getProtocolDAOShare();
    }

    // @notice Returns the current voter share (taking into account the security council adder)
    function getEffectiveVoterShare() override public view returns (uint256) {
        return getVoterShare() - getNodeShareSecurityCouncilAdder();
    }

    // @notice Returns the current node share (taking into account the security council adder)
    function getEffectiveNodeShare() override public view returns (uint256) {
        return getNodeShare() + getNodeShareSecurityCouncilAdder();
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

    /// @notice Target rETH collateralisation rate as a fraction of 1 ether
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

    /// @notice Returns a list of addresses allowed to update commission share parameters
    function getAllowListedControllers() override public view returns (address[] memory) {
        return getSettingAddressList("network.allow.listed.controllers");
    }

    /// @notice Returns the maximum amount rETH balance deltas can be changed per submission (as a percentage of 1e18)
    function getMaxRethDelta() override external view returns (uint256) {
        return getSettingUint("network.max.reth.balance.delta");
    }

    /// @notice Returns true if the supplied address is one of the allow listed controllers
    /// @param _address The address to check for on the allow list
    function isAllowListedController(address _address) override public view returns (bool) {
        address[] memory allowList = getAllowListedControllers();
        for (uint256 i = 0; i < allowList.length; ++i) {
            if (allowList[i] == _address) return true;
        }
        return false;
    }

    /// @notice Returns the deposit pool collateral target as a percentage
    function getDepositPoolCollateralTarget() override external view returns (uint256) {
        return getSettingUint("deposit.pool.collateral.target");
    }

    /// @notice Returns whether the protocol has entered the "Megapool exit phase"
    function getMegapoolExitPhase() override external view returns (bool) {
        return getSettingBool("megapool.exit.phase");
    }

    /// @notice Returns the staking delay
    function getStakingDelay() override external view returns (uint256) {
        return getSettingUint("staking.delay");
    }

    /// @notice Returns the tournament size for redemption selection
    function getTournamentSize() override external view returns (uint256) {
        return getSettingUint("tournament.size");
    }

    /// @notice Returns the cooperative exit phase in hours
    function getCooperativeExitPhase() override external view returns (uint256) {
        return getSettingUint("network.cooperative.exit.phase");
    }

    /// @notice Returns the penalty for not cooperatively exiting
    function getDidNotExitPenalty() override external view returns (uint256) {
        return getSettingUint("network.did.not.exit.penalty");
    }

    /// @notice Returns the cooldown after a failed cooperative exit before the oDAO can try again
    function getDidNotExitCooldown() override external view returns (uint256) {
        return getSettingUint("network.did.not.exit.cooldown");
    }

    /// @notice Returns true if performance exits are globally enabled
    function getPerformanceExitsEnabled() override external view returns (bool) {
        return getSettingBool("network.performance.exits.enabled");
    }

    /// @notice Returns the performance measurement period in epochs
    function getPerformancePeriod() override external view returns (uint256) {
        return getSettingUint("network.performance.period");
    }

    /// @notice Returns the buffer in epochs for generating performance challenge proofs
    function getPerformanceProofBuffer() override external view returns (uint256) {
        return getSettingUint("network.performance.proof.buffer");
    }

    /// @notice Returns the minimum performance threshold as a fraction of 1 ether
    function getPerformanceThreshold() override external view returns (uint256) {
        return getSettingUint("network.performance.threshold");
    }

    /// @notice Returns how long a performance challenge can be defeated before finalisation
    function getPerformanceChallengePeriod() override external view returns (uint256) {
        return getSettingUint("network.performance.challenge.period");
    }

    /// @notice Called by an explicitly allowed address to modify the security council adder parameter
    /// @param _value New value for the parameter
    function setNodeShareSecurityCouncilAdder(uint256 _value) override external onlyAllowListedController {
        _setNodeShareSecurityCouncilAdder(_value);
    }

    /// @notice Called by an explicitly allowed address to modify the node commission share parameter
    /// @param _value New value for the parameter
    function setNodeCommissionShare(uint256 _value) override external onlyAllowListedController {
        _setNodeCommissionShare(_value);
    }

    /// @notice Called by an explicitly allowed address to modify the voter share parameter
    /// @param _value New value for the parameter
    function setVoterShare(uint256 _value) override external onlyAllowListedController {
        _setVoterShare(_value);
    }

    /// @notice Called by an explicitly allowed address to modify the pdao share parameter
    /// @param _value New value for the parameter
    function setProtocolDAOShare(uint256 _value) override external onlyAllowListedController {
        _setProtocolDAOShare(_value);
    }

    /// @dev Internal implementation of setting the node share security council adder parameter
    function _setNodeShareSecurityCouncilAdder(uint256 _value) internal {
        // Validate input
        uint256 maxAdderValue = getSettingUint("network.max.node.commission.share.council.adder");
        require(_value <= maxAdderValue, "Value must be <= max value");
        uint256 maxVoterValue = getSettingUint("network.voter.share");
        require(_value <= maxVoterValue, "Value must be <= voter share");
        // Make setting change
        _setSettingUint("network.node.commission.share.security.council.adder", _value);
        // Sanity check value
        require(getRethCommission() <= 1 ether, "rETH Commission must be <= 100%");
        // Notify change of UARS parameter for snapshot
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        rocketNetworkRevenues.setVoterShare(getEffectiveVoterShare());
        rocketNetworkRevenues.setNodeShare(getEffectiveNodeShare());
    }

    /// @dev Internal implementation of setting the node commission share parameter
    function _setNodeCommissionShare(uint256 _value) internal {
        // Make setting change
        _setSettingUint("network.node.commission.share", _value);
        // Sanity check value
        require(getRethCommission() <= 1 ether, "rETH Commission must be <= 100%");
        // Notify change of UARS parameter for snapshot
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        rocketNetworkRevenues.setNodeShare(getEffectiveNodeShare());
    }

    /// @dev Internal implementation of setting the voter share parameter
    function _setVoterShare(uint256 _value) internal {
        // Make setting change
        _setSettingUint("network.voter.share", _value);
        // Sanity check value
        require(getRethCommission() <= 1 ether, "rETH Commission must be <= 100%");
        // Notify change of UARS parameter for snapshot
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        rocketNetworkRevenues.setVoterShare(getEffectiveVoterShare());
    }

    /// @dev Internal implementation of setting the pdao share parameter
    function _setProtocolDAOShare(uint256 _value) internal {
        // Make setting change
        _setSettingUint("network.pdao.share", _value);
        // Sanity check value
        require(getRethCommission() <= 1 ether, "rETH Commission must be <= 100%");
        // Notify change of UARS parameter for snapshot
        RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
        rocketNetworkRevenues.setProtocolDAOShare(_value);
    }
}
