pragma solidity 0.4.24;

// Contracts
import "./RocketBase.sol";
// Interfaces
import "./interface/RocketStorageInterface.sol";
// Utilities
import "./lib/Strings.sol";



/// @title A group is an entity that has users in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketGroup is RocketBase {

    /*** Libs  **************/

    using Strings for string;


    /*** Contracts **************/


    /*** Events ****************/

    event FlagString (
        string flag
    );

       
    /*** Modifiers *************/
    
       
    /*** Constructor *************/

    /// @dev rocketGroup constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }
    

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param _ID The groups unique identifier - should be strictly lower case
    /// @param _name Name of the group (eg rocketpool, coinbase etc) 
    /// @param _stakingFee The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function add(string _ID, string _name, uint256 _stakingFee) public returns (bool) {
        
        // Make the ID lower case
        emit FlagString(_ID.lower());
    }

}