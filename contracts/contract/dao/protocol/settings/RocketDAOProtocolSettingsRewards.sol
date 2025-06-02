// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Settings relating to RPL reward intervals
contract RocketDAOProtocolSettingsRewards is RocketDAOProtocolSettings, RocketDAOProtocolSettingsRewardsInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "rewards") {
        version = 2;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // RPL Claims settings
            setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimTrustedNode")), 0.2 ether);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimDAO")), 0.1 ether);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimNode")), 0.7 ether);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount.updated.time")), block.timestamp);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "periods")), 28);                  // The number of submission periods in which a claim period will span - 28 periods = 28 days by default
            // Deployment check
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);  // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }

    /*** Settings ****************/

    /// @notice Updates the percentages the trusted nodes use when calculating RPL reward trees. Percentages must add up to 100%
    /// @param _trustedNodePercent The percentage of rewards paid to the trusted node set (as a fraction of 1e18)
    /// @param _protocolPercent The percentage of rewards paid to the protocol dao (as a fraction of 1e18)
    /// @param _nodePercent The percentage of rewards paid to the node operators (as a fraction of 1e18)
    function setSettingRewardsClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) override external onlyDAOProtocolProposal {
        // Check total
        require(_trustedNodePercent + _protocolPercent + _nodePercent == 1 ether, "Total does not equal 100%");
        // Update now
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimTrustedNode")), _trustedNodePercent);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimDAO")), _protocolPercent);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimNode")), _nodePercent);
        // Set time last updated
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount.updated.time")), block.timestamp);
    }

    /// @notice Get the percentage of rewards paid to a contract by its internal name. Deprecated in favour of individual
    ///         getRewardClaimers*Perc() methods. Retained for backwards compatibility.
    function getRewardsClaimerPerc(string memory _contractName) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", _contractName)));
    }

    /// @notice Get the percentages paid to each of the reward recipients on each internval
    function getRewardsClaimersPerc() override public view returns (uint256 trustedNodePerc, uint256 protocolPerc, uint256 nodePerc) {
        trustedNodePerc = getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimTrustedNode")));
        protocolPerc = getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimDAO")));
        nodePerc = getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimNode")));
    }

    /// @notice Get the percentage of rewards paid to the trusted nodes
    function getRewardsClaimersTrustedNodePerc() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimTrustedNode")));
    }

    /// @notice Get the percentage of rewards paid to the protocol dao
    function getRewardsClaimersProtocolPerc() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimDAO")));
    }

    /// @notice Get the percentage of rewards paid to the node operators
    function getRewardsClaimersNodePerc() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", "rocketClaimNode")));
    }

    /// @notice Get the time of when the claim percentages were last updated
    function getRewardsClaimersTimeUpdated() override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount.updated.time")));
    } 

    /// @notice The number of submission periods after which claims can be made
    function getRewardsClaimIntervalPeriods() override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "periods")));
    }

    /// @notice The interval time for reward periods
    function getRewardsClaimIntervalTime() override external view returns (uint256) {
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "periods"))) * rocketDAOProtocolSettingsNetwork.getSubmitBalancesFrequency();
    }
}
