pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/network/RocketDAONetworkInterface.sol";
import "../../../interface/dao/network/RocketDAONetworkProposalsInterface.sol";
import "../../../interface/dao/network/RocketDAONetworkSettingsInterface.sol";
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
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    
        
    /*** Proposals **********************/

    // Change one of the current uint256 settings of the network DAO
    function proposalSettingUint(string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONetworkSettingsInterface rocketDAONetworkSettings = RocketDAONetworkSettingsInterface(getContractAddress("rocketDAONetworkSettings"));
        // Some safety guards for certain settings
        // Check the inflation block interval
        if(keccak256(bytes(_settingPath)) == keccak256(bytes('rpl.inflation.interval.blocks'))) {
                // Cannot be 0, set 'rpl.inflation.interval.rate' to 0 if inflation is no longer required
                require(_value > 0, "Inflation interval block amount cannot be 0 or less");
        }
        // The start blocks for inflation must be a future block and cannot be set again once started
        if(keccak256(bytes(_settingPath)) == keccak256(bytes('rpl.inflation.interval.start'))) {
                // Must be a block in the future
                require(_value > block.number, "Inflation interval start block must be a future block");
                // If it's already set and started, a new start block cannot be set
                if(rocketDAONetworkSettings.getInflationIntervalStartBlock() > 0) {
                    require(rocketDAONetworkSettings.getInflationIntervalStartBlock() > block.number, "Inflation has already started");
                }
        }
        // Ok all good, lets update
        rocketDAONetworkSettings.setSettingUint(_settingPath, _value);
    }
        
    // Update a claimer for the rpl rewards, must specify a unique contract name that will be claiming from and a percentage of the rewards
    function proposalSettingRewardsClaimer(string memory _contractName, uint256 _perc) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONetworkSettingsInterface rocketDAONetworkSettings = RocketDAONetworkSettingsInterface(getContractAddress("rocketDAONetworkSettings"));
        // Update now
        rocketDAONetworkSettings.setSettingRewardsClaimer(_contractName, _perc);
    }
    

}
