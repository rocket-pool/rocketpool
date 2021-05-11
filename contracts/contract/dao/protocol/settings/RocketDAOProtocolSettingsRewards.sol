pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

// Settings in RP which the DAO will have full control over
contract RocketDAOProtocolSettingsRewards is RocketDAOProtocolSettings, RocketDAOProtocolSettingsRewardsInterface {

    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "rewards") {
        // Set version 
        version = 1;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Each of the initial RPL reward claiming contracts
            setSettingRewardsClaimer('rocketClaimDAO', 0.1 ether);                                              // DAO Rewards claim % amount - Percentage given of 1 ether
            setSettingRewardsClaimer('rocketClaimNode', 0.70 ether);                                            // Bonded Node Rewards claim % amount - Percentage given of 1 ether
            setSettingRewardsClaimer('rocketClaimTrustedNode', 0.2 ether);                                      // Trusted Node Rewards claim % amount - Percentage given of 1 ether
            // RPL Claims settings
            setSettingUint("rpl.rewards.claim.period.time", 14 days);                                           // The time in which a claim period will span in seconds - 14 days by default
            // Deployment check
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);                           // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }


    /*** Settings ****************/

    // Set a new claimer for the rpl rewards, must specify a unique contract name that will be claiming from and a percentage of the rewards
    function setSettingRewardsClaimer(string memory _contractName, uint256 _perc) override public onlyDAOProtocolProposal {
        // Get the total perc set, can't be more than 100
        uint256 percTotal = getRewardsClaimersPercTotal();
        // If this group already exists, it will update the perc
        uint256 percTotalUpdate = percTotal.add(_perc).sub(getRewardsClaimerPerc(_contractName));
        // Can't be more than a total claim amount of 100%
        require(percTotalUpdate <= 1 ether, "Claimers cannot total more than 100%");
        // Update the total
        setUint(keccak256(abi.encodePacked(settingNameSpace,"rewards.claims", "group.totalPerc")), percTotalUpdate);
        // Update/Add the claimer amount
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", _contractName)), _perc);
        // Set the time it was updated at
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount.updated.time", _contractName)), block.timestamp);
    }



    /*** RPL Claims ***********************************************/


    // RPL Rewards Claimers (own namespace to prevent DAO setting voting to overwrite them)

    // Get the perc amount that this rewards contract get claim
    function getRewardsClaimerPerc(string memory _contractName) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount", _contractName)));
    } 

    // Get the time of when the claim perc was last updated
    function getRewardsClaimerPercTimeUpdated(string memory _contractName) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.amount.updated.time", _contractName)));
    } 

    // Get the perc amount total for all claimers (remaining goes to DAO)
    function getRewardsClaimersPercTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "group.totalPerc")));
    }


    // RPL Rewards General Settings

    // The period over which claims can be made
    function getRewardsClaimIntervalTime() override external view returns (uint256) {
        return getSettingUint("rpl.rewards.claim.period.time");
    }


}
