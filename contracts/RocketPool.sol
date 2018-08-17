pragma solidity 0.4.24;

import "./RocketBase.sol";
import "./interface/RocketStorageInterface.sol";



/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is main pool management contract
/// @author David Rugendyke
contract RocketPool is RocketBase {

    /*** Contracts **************/

  
    /*** Events ****************/

       
    /*** Modifiers *************/
    
       
    /*** Constructor *************/

    /// @dev rocketPool constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }
    

    /*** Methods *************/

   



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