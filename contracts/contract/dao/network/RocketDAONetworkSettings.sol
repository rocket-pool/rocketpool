pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/network/RocketDAONetworkSettingsInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

// Settings in RP which the DAO will have full control over
contract RocketDAONetworkSettings is RocketBase, RocketDAONetworkSettingsInterface {

    using SafeMath for uint;

    // The namespace for any data stored in the network DAO settings (do not change)
    string daoNameSpace = 'dao.network.setting';

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version 
        version = 1;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")))) {
            // RPL Claims groups (the DAO does not need to be set, it will claim remaining rewards each claim after each interval)
            setSettingRewardsClaimer('rocketClaimDAO', 0.1 ether);                                              // DAO Rewards claim % amount - Percentage given of 1 ether
            setSettingRewardsClaimer('rocketClaimNode', 0.70 ether);                                             // Bonded Node Rewards claim % amount - Percentage given of 1 ether
            setSettingRewardsClaimer('rocketClaimTrustedNode', 0.2 ether);                                      // Trusted Node Rewards claim % amount - Percentage given of 1 ether
            // RPL Claims settings
            setSettingUint("rpl.rewards.claim.period.blocks", 86380);                                           // The period at which a claim period will span in blocks - 14 days approx by default
            // RPL Inflation settings
            setSettingUint("rpl.inflation.interval.rate", 1000133680617113500);                                 // 5% annual calculated on a daily interval of blocks (6170 = 1 day approx in 14sec blocks) - Calculate in js example: let dailyInflation = web3.utils.toBN((1 + 0.05) ** (1 / (365)) * 1e18);
            setSettingUint("rpl.inflation.interval.blocks", 6170);                                              // How often the inflation is calculated, if this is changed significantly, then the above 'rpl.inflation.interval.rate' will need to be adjusted. If inflation is no longer required, set 'rpl.inflation.interval.rate' to 0, not this parameter                
            setSettingUint("rpl.inflation.interval.start", block.number+(getInflationIntervalBlocks()*14));     // Set the default start date for inflation to begin as 2 weeks from contract deployment (this can be changed after deployment)
            // Deployment check
            setBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")), true);                               // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
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
    function setSettingUint(string memory _settingPath, uint256 _value) override public {
        // If this contract has been initialised, only allow access from the proposals contract
        if(getBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")))) require(getContractAddress('rocketDAONetworkProposals') == msg.sender, "Only DAO Network Proposals contract can update a setting");
        // Update setting now
        setUint(keccak256(abi.encodePacked(daoNameSpace, _settingPath)), _value);
    } 


    // Set a new claimer for the rpl rewards, must specify a unique contract name that will be claiming from and a percentage of the rewards
    function setSettingRewardsClaimer(string memory _contractName, uint256 _perc) override public {
        // If this contract has been initialised, only allow access from the proposals contract
        if(getBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")))) require(getContractAddress('rocketDAONetworkProposals') == msg.sender, "Only DAO Network Proposals contract can update a setting");
        // Get the total perc set, can't be more than 100
        uint256 percTotal = getRewardsClaimersPercTotal();
        // If this group already exists, it will update the perc
        uint256 percTotalUpdate = percTotal.add(_perc).sub(getRewardsClaimerPerc(_contractName));
        // Can't be more than a total claim amount of 100%
        require(percTotalUpdate <= 1 ether, "Claimers cannot total more than 100%");
        // Update the total
        setUint(keccak256(abi.encodePacked(daoNameSpace,"rewards.claims", "group.totalPerc")), percTotalUpdate);
        // Update/Add the claimer amount
        setUint(keccak256(abi.encodePacked(daoNameSpace, "rewards.claims", "group.amount", _contractName)), _perc);
        // Set the block it was updated at
        setUint(keccak256(abi.encodePacked(daoNameSpace, "rewards.claims", "group.amount.updated.block", _contractName)), block.number);
    }



    /*** RPL Claims ***********************************************/

    // DAO Address for RPL rewards, it will only receive the rewards once the address is set
    // TODO: Send to DAO contract, remove when done
    /*
    function getRewardsDAOAddress() override external view returns (address) {
        return getAddressS("settings.dao.rpl.rewards.address");
    }

    // DAO Address for RPL rewards, if it is 0, DAO RPL rewards will build up until it is set, they will then be transferred
    function setRewardsDAOAddress(address _value) public onlyGuardian {
        setAddressS("settings.dao.rpl.rewards.address", _value); 
    }*/

    // RPL Rewards Claimers (own namespace to prevent DAO setting voting to overwrite them)

    // Get the perc amount that this rewards contract get claim
    function getRewardsClaimerPerc(string memory _contractName) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rewards.claims", "group.amount", _contractName)));
    } 

    // Get the perc amount that this rewards contract get claim
    function getRewardsClaimerPercBlockUpdated(string memory _contractName) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rewards.claims", "group.amount.updated.block", _contractName)));
    } 

    // Get the perc amount total for all claimers (remaining goes to DAO)
    function getRewardsClaimersPercTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rewards.claims", "group.totalPerc")));
    }


    // RPL Rewards General Settings

    // The period over which claims can be made
    function getRewardsClaimIntervalBlocks() override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rpl.rewards.claim.period.blocks")));
    }


    /*** RPL Contract Settings *****************************************/

    // RPL yearly inflation rate per interval (daily by default)
    function getInflationIntervalRate() override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rpl.inflation.interval.rate")));
    }
    
    // Inflation block interval (default is 6170 = 1 day approx in 14sec blocks) 
    function getInflationIntervalBlocks() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rpl.inflation.interval.blocks"))); 
    }

    // The block to start inflation at
    function getInflationIntervalStartBlock() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "rpl.inflation.interval.start"))); 
    }


}
