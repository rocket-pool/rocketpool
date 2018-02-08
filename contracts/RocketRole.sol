pragma solidity 0.4.19;

import "./RocketBase.sol";
import "./interface/RocketStorageInterface.sol";

/// @title Role Based Access Control for Rocket Pool
/// @author David Rugendyke
contract RocketRole is RocketBase {


     /*** Events **************/

    event RoleAdded(string _roleName, address _address);
    event RoleRemoved(string _roleName, address _address);
    event OwnershipTransferred(address indexed _previousOwner, address indexed _newOwner);


    /*** Modifiers ************/

    /// @dev Only allow access from the latest version of the RocketRole contract
    modifier onlyLatestRocketRole() {
        require(address(this) == rocketStorage.getAddress(keccak256("contract.name", "rocketRole")));
        _;
    }
  
    /*** Constructor **********/
   
    /// @dev constructor
    function RocketRole(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }

     /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param _newOwner The address to transfer ownership to.
    */
    function transferOwnership(address _newOwner) public onlyLatestRocketRole onlyOwner {
        // Legit address?
        require(_newOwner != 0x0);
        // Check the role exists 
        roleCheck("owner", msg.sender);
        // Remove current role
        rocketStorage.deleteBool(keccak256("access.role", "owner", msg.sender));
        // Add new owner
        rocketStorage.setBool(keccak256("access.role",  "owner", _newOwner), true);
    }


    /**** Admin Role Methods ***********/


   /**
   * @dev Give an address access to this role
   */
    function adminRoleAdd(string _role, address _address) onlyLatestRocketRole onlySuperUser public {
        roleAdd(_role, _address);
    }

    /**
   * @dev Remove an address access to this role
   */
    function adminRoleRemove(string _role, address _address) onlyLatestRocketRole onlySuperUser public {
        roleRemove(_role, _address);
    }


    /**** Internal Role Methods ***********/
   
    /**
   * @dev Give an address access to this role
   */
    function roleAdd(string _role, address _address) internal {
        // Legit address?
        require(_address != 0x0);
        // Only one owner to rule them all
        require(keccak256(_role) != keccak256("owner"));
        // Add it
        rocketStorage.setBool(keccak256("access.role", _role, _address), true);
        // Log it
        RoleAdded(_role, _address);
    }

    /**
    * @dev Remove an address' access to this role
    */
    function roleRemove(string _role, address _address) internal {
        // Only an owner can transfer their access
        require(!roleHas("owner", _address));
        // Remove from storage
        rocketStorage.deleteBool(keccak256("access.role", _role, _address));
        // Log it
        RoleRemoved(_role, _address);
    }
    
    
}
