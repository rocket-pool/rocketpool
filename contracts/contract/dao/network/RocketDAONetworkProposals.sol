pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/network/RocketDAONetworkInterface.sol";
import "../../../interface/dao/network/RocketDAONetworkProposalsInterface.sol";
import "../../../interface/dao/network/settings/RocketDAONetworkSettingsInterface.sol";
import "../../../interface/dao/network/settings/RocketDAONetworkSettingsRewardsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Network DAO Proposals - Placeholder contracts until DAO is implemented
contract RocketDAONetworkProposals is RocketBase, RocketDAONetworkProposalsInterface {  

    using SafeMath for uint;

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.network';

    // Possible types of trusted node proposals
    enum ProposalType {
        Setting             // Change a DAO setting (Node operator min/max fees, inflation rate etc)
    }


    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAONetwork") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    
        
    /*** Proposals **********************/

    // Change one of the current uint256 settings of the network DAO
    function proposalSettingUint(string memory _settingContract, string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONetworkSettingsInterface rocketDAONetworkSettings = RocketDAONetworkSettingsInterface(getContractAddress(_settingContract));
        // Lets update
        rocketDAONetworkSettings.setSettingUint(_settingPath, _value);
    }
        
    // Update a claimer for the rpl rewards, must specify a unique contract name that will be claiming from and a percentage of the rewards
    function proposalSettingRewardsClaimer(string memory _contractName, uint256 _perc) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONetworkSettingsRewardsInterface rocketDAONetworkSettingsRewards = RocketDAONetworkSettingsRewardsInterface(getContractAddress("rocketDAONetworkSettingsRewards"));
        // Update now
        rocketDAONetworkSettingsRewards.setSettingRewardsClaimer(_contractName, _perc);
    }
    

}
