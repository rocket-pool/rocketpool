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

     event GroupAdd (
        string _ID,
        string name,
        uint256 stakingFee,
        uint256 created
    );


    // TODO: Remove Flag Events
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


    /*** Getters *************/

    /// @dev Get the group by its ID
    function getGroupName(string _groupID) public view returns(string) { 
        // Get the group name
        rocketStorage.getString(keccak256(abi.encodePacked("api.group.name", _groupID)));
    }

    /// @dev Get a verified address for the group that's allowed to interact with RP
    function getGroupAddress(string _groupID) public view returns(address) { 
        // Get the group name
        rocketStorage.getAddress(keccak256(abi.encodePacked("api.group.address", _groupID)));
    }
    

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param _ID The groups unique identifier - should be strictly lower case
    /// @param _name Name of the group (eg rocketpool, coinbase etc) 
    /// @param _stakingFee The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function add(string _ID, string _name, uint256 _stakingFee) public returns (bool) {
        // Check the ID supplied is > 2 chars
        require(bytes(_ID).length > 2, "Group ID is to short, must be a minimum of 3 characters.");
        // Check the name is ok
        require(bytes(_ID).length > 2, "Group Name is to short, must be a minimum of 3 characters.");
        // Check the staking fee is ok
        require(_stakingFee >= 0, "Staking fee cannot be less than 0.");
        // Make the ID lower case
        _ID = _ID.lower();
        // Check this group ID isn't already being used
        require(bytes(rocketStorage.getString(keccak256(abi.encodePacked("api.group.id", _ID)))).length == 0, "Group ID is already being used.");
        // Check the group name isn't already being used
        require(bytes(rocketStorage.getString(keccak256(abi.encodePacked("api.group.name", _ID)))).length == 0, "Group name is already being used.");
        // Log it
        emit GroupAdd(_ID, _name, _stakingFee, now);
    }

}