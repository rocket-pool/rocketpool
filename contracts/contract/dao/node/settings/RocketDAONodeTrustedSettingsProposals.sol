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
            setSettingUint('proposal.cooldown', 13220);                      // How long before a member can make sequential proposals. Approx. 2 days of blocks
            setSettingUint('proposal.vote.blocks', 92550);                   // How long a proposal can be voted on. Approx. 2 weeks worth of blocks
            setSettingUint('proposal.vote.delay.blocks', 46276);             // How long before a proposal can be voted on after it is created. Approx. 1 week
            setSettingUint('proposal.execute.blocks', 185100);               // How long a proposal can be executed after its voting period is finished. Approx. 4 weeks worth of blocks
            setSettingUint('proposal.action.blocks', 185100);                // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires Approx. 2 weeks worth of blocks     
            // Settings initialized
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

  
    // Getters

    // How long before a member can make sequential proposals. Approx. 2 days of blocks
    function getCooldown() override public view returns (uint256) { 
        return getSettingUint('proposal.cooldown');
    }

    // How long a proposal can be voted on. Approx. 2 weeks worth of blocks
    function getVoteBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.vote.blocks');
    }

    // How long before a proposal can be voted on after it is created. Approx. Next Block
    function getVoteDelayBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.vote.delay.blocks');
    }

    // How long a proposal can be executed after its voting period is finished Approx. 4 weeks worth of blocks
    function getExecuteBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.execute.blocks');
    }

    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires Approx. 2 weeks worth of blocks
    function getActionBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.action.blocks');
    }
        

}
