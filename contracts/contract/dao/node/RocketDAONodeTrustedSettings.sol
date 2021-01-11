pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedSettingsInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrustedSettings is RocketBase, RocketDAONodeTrustedSettingsInterface { 

    // The namespace for any data stored in the trusted node DAO settings (do not change)
    string daoNameSpace = 'dao.trustednodes.setting';

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
        // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")))) {
            setUint(keccak256(abi.encodePacked(daoNameSpace, "quorum")), 0.51 ether);                    // Quorum threshold that must be met for proposals to pass
            setUint(keccak256(abi.encodePacked(daoNameSpace, "rplbond")), 15000 ether);                  // Bond amount required for a new member to join
            setUint(keccak256(abi.encodePacked(daoNameSpace, "minipool.unbonded.max")), 250);            // The amount of unbonded minipool validators members can make (these validators are only used if no regular bonded validators are available)
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.cooldown")), 13220);              // How long before a member can make sequential proposals. Approx. 2 days of blocks
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.vote.blocks")), 92550);           // How long a proposal can be voted on. Approx. 2 weeks worth of blocks
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.vote.delay.blocks")), 1);         // How long before a proposal can be voted on after it is created. Approx. Next Block
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.execute.blocks")), 185100);       // How long a proposal can be executed after its voting period is finished. Approx. 4 weeks worth of blocks
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.action.blocks")), 92550);         // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires Approx. 2 weeks worth of blocks
            setBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")), true);                        // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }

    /*** Helper  ****************/

    // A general method to return any setting given the setting path is correct, only accepts uints
    function getSettingUint(string memory _settingPath) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, _settingPath)));
    } 
    

    /*** Settings ****************/

    // Setter
       
    // Update a setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingUint(string memory _settingPath, uint256 _value) override external {
        // Make sure only the DAO contract can update a setting
        require(msg.sender == getContractAddress('rocketDAONodeTrustedProposals'), "Only the rocketDAONodeTrustedProposals contract can update a DAO setting");
        setUint(keccak256(abi.encodePacked(daoNameSpace, _settingPath)), _value);
    } 
    

    // Getters

    // The quorum threshold for this DAO
    function getQuorum() override public view returns (uint256) { 
        return getSettingUint('quorum');
    }

    // Amount of RPL needed for a new member
    function getRPLBond() override public view returns (uint256) { 
        return getSettingUint('rplbond');
    }

    // The amount of unbonded minipool validators members can make (these validators are only used if no regular bonded validators are available)
    function getMinipoolUnbondedMax() override public view returns (uint256) { 
        return getSettingUint('minipool.unbonded.max');
    }

    // How long before a member can make sequential proposals. Approx. 2 days of blocks
    function getProposalCooldown() override public view returns (uint256) { 
        return getSettingUint('proposal.cooldown');
    }

    // How long a proposal can be voted on. Approx. 2 weeks worth of blocks
    function getProposalVoteBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.vote.blocks');
    }

    // How long before a proposal can be voted on after it is created. Approx. Next Block
    function getProposalVoteDelayBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.vote.delay.blocks');
    }

    // How long a proposal can be executed after its voting period is finished Approx. 4 weeks worth of blocks
    function getProposalExecuteBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.execute.blocks');
    }

    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires Approx. 2 weeks worth of blocks
    function getProposalActionBlocks() override public view returns (uint256) { 
        return getSettingUint('proposal.action.blocks');
    }
    
        

}
