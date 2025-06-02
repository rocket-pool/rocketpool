// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInflationInterface.sol";
import "../../../../interface/token/RocketTokenRPLInterface.sol";

/// @notice RPL Inflation settings in RP which the DAO will have full control over
contract RocketDAOProtocolSettingsInflation is RocketDAOProtocolSettings, RocketDAOProtocolSettingsInflationInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "inflation") {
        version = 2;
         // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // RPL Inflation settings
            setSettingUint("rpl.inflation.interval.rate", 1000133680617113500);                                 // 5% annual calculated on a daily interval - Calculate in js example: let dailyInflation = web3.utils.toBN((1 + 0.05) ** (1 / (365)) * 1e18);
            setSettingUint("rpl.inflation.interval.start", block.timestamp + 1 days);                           // Set the default start date for inflation to begin as 1 day after deployment
            // Deployment check
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);                           // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgrade
        }
    }
    
    /*** Set Uint *****************************************/

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        // The start time for inflation must be in the future and cannot be set again once started
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(bytes(_settingPath));
            if(settingKey == keccak256(bytes("rpl.inflation.interval.start"))) {
                // Must be a future timestamp
                require(_value > block.timestamp, "Inflation interval start time must be in the future");
                // If it's already set and started, a new start block cannot be set
                if(getInflationIntervalStartTime() > 0) {
                    require(getInflationIntervalStartTime() > block.timestamp, "Inflation has already started");
                }
            } else if(settingKey == keccak256(bytes("rpl.inflation.interval.rate"))) {
                // No greater than 1e16 more than the previous value. (RPIP-33)
                require(_value <= getSettingUint("rpl.inflation.interval.rate") + 0.01 ether, "No greater than 1e16 more than the previous value");
                require(_value >= 1, "Inflation can't be negative");
                // RPL contract address
                address rplContractAddress = getContractAddressUnsafe("rocketTokenRPL");
                if(rplContractAddress != address(0x0)) {
                    // Force inflation at old rate before updating inflation rate
                    RocketTokenRPLInterface rplContract = RocketTokenRPLInterface(rplContractAddress);
                    // Mint any new tokens from the RPL inflation
                    rplContract.inflationMintTokens();
                }
            }
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /*** RPL Contract Settings *****************************************/

    /// @notice RPL yearly inflation rate per interval (daily by default)
    function getInflationIntervalRate() override external view returns (uint256) {
        return getSettingUint("rpl.inflation.interval.rate");
    }
    
    /// @notice The block to start inflation at
    function getInflationIntervalStartTime() override public view returns (uint256) {
        return getSettingUint("rpl.inflation.interval.start"); 
    }

}
