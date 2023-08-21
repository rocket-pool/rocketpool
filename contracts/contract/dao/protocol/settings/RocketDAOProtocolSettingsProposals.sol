// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";

// The Trusted Node DAO Members 
contract RocketDAOProtocolSettingsProposals is RocketDAOProtocolSettings, RocketDAOProtocolSettingsProposalsInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "proposals") {
        // Set version
        version = 2;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("proposal.cooldown.time", 2 days);               // How long before a member can make sequential proposals
            setSettingUint("proposal.vote.time", 2 weeks);                  // How long a proposal can be voted on
            setSettingUint("proposal.vote.delay.time", 1 weeks);            // How long before a proposal can be voted on after it is created
            setSettingUint("proposal.execute.time", 4 weeks);               // How long a proposal can be executed after its voting period is finished
            setSettingUint("proposal.action.time", 4 weeks);                // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires
            setSettingUint("proposal.bond", 100 ether);                     // The amount of RPL a proposer has to put up as a bond for creating a new proposal
            setSettingUint("proposal.challenge.bond", 10 ether);            // The amount of RPL a challenger has to put up as a bond for challenging a proposal
            setSettingUint("proposal.challenge.period", 30 minutes);        // The amount of time a proposer has to respond to a challenge before a proposal is defeated
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

  
    // Getters

    // How long before a member can make sequential proposals
    function getCooldownTime() override external view returns (uint256) {
        return getSettingUint("proposal.cooldown.time");
    }

    // How long a proposal can be voted on
    function getVoteTime() override external view returns (uint256) {
        return getSettingUint("proposal.vote.time");
    }

    // How long before a proposal can be voted on after it is created
    function getVoteDelayTime() override external view returns (uint256) {
        return getSettingUint("proposal.vote.delay.time");
    }

    // How long a proposal can be executed after its voting period is finished
    function getExecuteTime() override external view returns (uint256) {
        return getSettingUint("proposal.execute.time");
    }

    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires
    function getActionTime() override external view returns (uint256) {
        return getSettingUint("proposal.action.time");
    }

    function getProposalBond() override external view returns (uint256) {
        return getSettingUint("proposal.bond");
    }

    function getChallengeBond() override external view returns (uint256) {
        return getSettingUint("proposal.challenge.bond");
    }

    function getChallengePeriod() override external view returns (uint256) {
        return getSettingUint("proposal.challenge.period");
    }
}
