pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInflationInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

// RPL Inflation settings in RP which the DAO will have full control over
contract RocketDAOProtocolSettingsInflation is RocketDAOProtocolSettings, RocketDAOProtocolSettingsInflationInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "inflation") {
        // Set version 
        version = 1;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // RPL Inflation settings
            setSettingUint("rpl.inflation.interval.rate", 1000133680617113440);                                 // 5% annual calculated on a daily interval of blocks (7200 = 1 day approx in 12sec blocks) - Calculate in js example: let dailyInflation = web3.utils.toBN((1 + 0.05) ** (1 / (365)) * 1e18);
            setSettingUint("rpl.inflation.interval.blocks", 7200);                                              // How often the inflation is calculated, if this is changed significantly, then the above 'rpl.inflation.interval.rate' will need to be adjusted. If inflation is no longer required, set 'rpl.inflation.interval.rate' to 0, not this parameter                
            setSettingUint("rpl.inflation.interval.start", block.number+(getInflationIntervalBlocks()*14));     // Set the default start date for inflation to begin as 2 weeks from contract deployment (this can be changed after deployment)
            // Deployment check
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);                           // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }
    
    

    /*** Set Uint *****************************************/

    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
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
                if(getInflationIntervalStartBlock() > 0) {
                    require(getInflationIntervalStartBlock() > block.number, "Inflation has already started");
                }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    } 
    

    /*** RPL Contract Settings *****************************************/

    // RPL yearly inflation rate per interval (daily by default)
    function getInflationIntervalRate() override external view returns (uint256) {
        return getSettingUint("rpl.inflation.interval.rate");
    }
    
    // Inflation block interval (default is 6170 = 1 day approx in 14sec blocks) 
    function getInflationIntervalBlocks() override public view returns (uint256) {
        return getSettingUint("rpl.inflation.interval.blocks"); 
    }

    // The block to start inflation at
    function getInflationIntervalStartBlock() override public view returns (uint256) {
        return getSettingUint("rpl.inflation.interval.start"); 
    }

}
