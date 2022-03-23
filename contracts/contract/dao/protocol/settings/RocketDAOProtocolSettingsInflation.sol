pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInflationInterface.sol";
import "../../../../interface/token/GoGoTokenGGPInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

// GGP Inflation settings in RP which the DAO will have full control over
contract RocketDAOProtocolSettingsInflation is RocketDAOProtocolSettings, RocketDAOProtocolSettingsInflationInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "inflation") {
        // Set version 
        version = 1;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // GGP Inflation settings
            setSettingUint("ggp.inflation.interval.rate", 1000133680617113500);                                 // 5% annual calculated on a daily interval - Calculate in js example: let dailyInflation = web3.utils.toBN((1 + 0.05) ** (1 / (365)) * 1e18);
            setSettingUint("ggp.inflation.interval.start", block.timestamp + 1 days);                           // Set the default start date for inflation to begin as 1 day after deployment
            // Deployment check
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);                           // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }
    
    

    /*** Set Uint *****************************************/

    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        // The start time for inflation must be in the future and cannot be set again once started
        bytes32 settingKey = keccak256(bytes(_settingPath));
        if(settingKey == keccak256(bytes("ggp.inflation.interval.start"))) {
            // Must be a future timestamp
            require(_value > block.timestamp, "Inflation interval start time must be in the future");
            // If it's already set and started, a new start block cannot be set
            if(getInflationIntervalStartTime() > 0) {
                require(getInflationIntervalStartTime() > block.timestamp, "Inflation has already started");
            }
        } else if(settingKey == keccak256(bytes("ggp.inflation.interval.rate"))) {
            // GGP contract address
            address ggpContractAddress = getContractAddressUnsafe("gogoTokenGGP");
            if(ggpContractAddress != address(0x0)) {
                // Force inflation at old rate before updating inflation rate
                GoGoTokenGGPInterface ggpContract = GoGoTokenGGPInterface(ggpContractAddress);
                // Mint any new tokens from the GGP inflation
                ggpContract.inflationMintTokens();
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /*** GGP Contract Settings *****************************************/

    // GGP yearly inflation rate per interval (daily by default)
    function getInflationIntervalRate() override external view returns (uint256) {
        return getSettingUint("ggp.inflation.interval.rate");
    }
    
    // The block to start inflation at
    function getInflationIntervalStartTime() override public view returns (uint256) {
        return getSettingUint("ggp.inflation.interval.start");
    }

}
