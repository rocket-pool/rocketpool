pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsProposalsInterface.sol";


// The Trusted Node DAO Members 
contract RocketDAONodeTrustedSettingsProposals is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsProposalsInterface { 

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "proposals") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("proposal.cooldown.time", 2 days);               // How long before a member can make sequential proposals
            setSettingUint("proposal.vote.time", 2 weeks);                  // How long a proposal can be voted on
            setSettingUint("proposal.vote.delay.time", 1 weeks);            // How long before a proposal can be voted on after it is created
            setSettingUint("proposal.execute.time", 4 weeks);               // How long a proposal can be executed after its voting period is finished
            setSettingUint("proposal.action.time", 4 weeks);                // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires
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

}
