pragma solidity 0.4.23;

import "./interface/RocketStorageInterface.sol";

/// @title Base settings / modifiers for each contract in Rocket Pool
/// @author David Rugendyke
contract RocketBase {


    /**** Properties ************/

    uint8 public version;                                                   // Version of this contract


    /*** Contracts **************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);       // The main storage contract where primary persistant storage is maintained


    /*** Modifiers ************/

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyOwner() {
        roleCheck("owner", msg.sender);
        _;
    }

    /**
    * @dev Modifier to scope access to admins
    */
    modifier onlyAdmin() {
        roleCheck("admin", msg.sender);
        _;
    }

    /**
    * @dev Modifier to scope access to admins
    */
    modifier onlySuperUser() {
        require(roleHas("owner", msg.sender) || roleHas("admin", msg.sender));
        _;
    }

    /**
    * @dev Reverts if the address doesn't have this role
    */
    modifier onlyRole(string _role) {
        roleCheck(_role, msg.sender);
        _;
    }

  
    /*** Constructor **********/
   
    /// @dev Set the main Rocket Storage address
    constructor(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /*** Role Utilities */

    /**
    * @dev Check if an address has this role
    * @return bool
    */
    function roleHas(string _role, address _address) internal view returns (bool) {
        return rocketStorage.getBool(keccak256("access.role", _role, _address));
    }

     /**
    * @dev Check if an address has this role, reverts if it doesn't
    */
    function roleCheck(string _role, address _address) view internal {
        require(roleHas(_role, _address) == true);
    }

    
    
}
