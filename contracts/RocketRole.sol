pragma solidity 0.5.0;


import "./RocketBase.sol";


/// @title Role Based Access Control for Rocket Pool
/// @author David Rugendyke
contract RocketRole is RocketBase {


     /*** Events **************/

    event RoleAdded(
        string _roleName, 
        address _address
    );

    event RoleRemoved(
        string _roleName, 
        address _address
    );

    event OwnershipTransferred(
        address indexed _previousOwner, 
        address indexed _newOwner
    );


    /*** Constructor **********/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }

     /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param _newOwner The address to transfer ownership to.
    */
    function transferOwnership(address _newOwner) public onlyLatestContract("rocketRole", address(this)) onlyOwner {
        // Legit address?
        require(_newOwner != address(0x0), "The new owner address is invalid");
        require(_newOwner != msg.sender, "The new owner address must not be the existing owner address");
        // Remove current role
        rocketStorage.deleteBool(keccak256(abi.encodePacked("access.role", "owner", msg.sender)));
        // Add new owner
        rocketStorage.setBool(keccak256(abi.encodePacked("access.role",  "owner", _newOwner)), true);
        // Log it
        emit OwnershipTransferred(msg.sender, _newOwner);
    }


    /**** Admin Role Methods ***********/


   /**
   * @dev Give an address access to this role
   */
    function adminRoleAdd(string memory _role, address _address) onlyLatestContract("rocketRole", address(this)) onlySuperUser public {
        roleAdd(_role, _address);
    }

    /**
   * @dev Remove an address access to this role
   */
    function adminRoleRemove(string memory _role, address _address) onlyLatestContract("rocketRole", address(this)) onlySuperUser public {
        roleRemove(_role, _address);
    }


    /**** Internal Role Methods ***********/
   
    /**
   * @dev Give an address access to this role
   */
    function roleAdd(string memory _role, address _address) internal {
        // Legit address?
        require(_address != address(0x0), "The role address is invalid");
        // Only one owner to rule them all
        require(keccak256(abi.encodePacked(_role)) != keccak256(abi.encodePacked("owner")), "The owner role cannot be added to an address");
        // Address does not already have role?
        require(rocketStorage.getBool(keccak256(abi.encodePacked("access.role", _role, _address))) == false, "The address already has access to this role");
        // Add it
        rocketStorage.setBool(keccak256(abi.encodePacked("access.role", _role, _address)), true);
        // Log it
        emit RoleAdded(_role, _address);
    }

    /**
    * @dev Remove an address' access to this role
    */
    function roleRemove(string memory _role, address _address) internal {
        // Only an owner can transfer their access
        require(!roleHas("owner", _address), "Roles cannot be removed from the owner address");
        // Address already has role?
        require(rocketStorage.getBool(keccak256(abi.encodePacked("access.role", _role, _address))) == true, "The address does not have access to this role");
        // Remove from storage
        rocketStorage.deleteBool(keccak256(abi.encodePacked("access.role", _role, _address)));
        // Log it
        emit RoleRemoved(_role, _address);
    }
    
    
}
