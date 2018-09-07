pragma solidity 0.4.24;

import "./RocketBase.sol";
import "./interface/minipool/RocketMinipoolFactoryInterface.sol";
import "./interface/settings/RocketMinipoolSettingsInterface.sol";
import "./interface/utils/lists/AddressListStorageInterface.sol";



/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is main pool management contract
/// @author David Rugendyke
contract RocketPool is RocketBase {

    /*** Contracts **************/


    RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(0);               // Where minipools are made
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);            // Settings for the minipools
    AddressListStorageInterface addressListStorage = AddressListStorageInterface(0);                        // Address list utility

  
    /*** Events ****************/

       
    /*** Modifiers *************/
    
       
    /*** Constructor *************/

    /// @dev rocketPool constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }
    

    /*** Methods *************/


    /// @dev Create a minipool
    function createMinipool(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external onlyLatestContract("rocketNodeAPI", msg.sender) returns (address) {

        // Get contracts
        rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));

        // Create minipool contract
        uint256 stakingDuration = rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        address minipoolAddress = rocketMinipoolFactory.createRocketMinipool(_nodeOwner, stakingDuration, _etherAmount, _rplAmount, _isTrustedNode);

        // Update minipool indexes
        addressListStorage.pushListItem(keccak256(abi.encodePacked("node.minipools", _nodeOwner)), minipoolAddress);
        addressListStorage.pushListItem(keccak256(abi.encodePacked("duration.minipools", _durationID)), minipoolAddress);
        addressListStorage.pushListItem(keccak256(abi.encodePacked("status.minipools", 0)), minipoolAddress);

        // Return minipool address
        return minipoolAddress;

    }


    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /*************************************************************/

    /// @dev Returns an memory array of addresses that do not equal 0, can be overloaded to support other types 
    /// @dev This is handy as memory arrays have a fixed size when initialised, this reduces the array to only valid values (so that .length works as you'd like)
    /// @dev This can be made redundant when .push is supported on dynamic memory arrays
    /// @param _addressArray An array of a fixed size of addresses
    function utilArrayFilterValuesOnly(address[] memory _addressArray) private pure returns (address[] memory) {
        // The indexes for the arrays
        uint[] memory indexes = new uint[](2); 
        indexes[0] = 0;
        indexes[1] = 0;
        // Calculate the length of the non empty values
        for (uint32 i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                indexes[0]++;
            }
        }
        // Create a new memory array at the length of our valid values we counted
        address[] memory valueArray = new address[](indexes[0]);
        // Now populate the array
        for (i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                valueArray[indexes[1]] = _addressArray[i];
                indexes[1]++;
            }
        }
        // Now return our memory array with only non empty values at the correct length
        return valueArray;
    }
}