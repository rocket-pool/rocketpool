pragma solidity 0.6.8;

import "../interface/RocketStorage.sol";

/// @title Base settings / modifiers for each contract in Rocket Pool
/// @author David Rugendyke

abstract contract RocketBase {


    /**** Properties ************/


    uint8 public version;                               // Version of this contract


    /*** Contracts **************/


    RocketStorage rocketStorage = RocketStorage(0);     // The main storage contract where primary persistant storage is maintained


    /*** Modifiers **************/


    /**
    * @dev Throws if called by any sender that doesn't match one of the supplied contract or is the latest version of that contract
    */
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName))), "Incorrect or outdated contract access used.");
        _;
    }


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
        require(roleHas("owner", msg.sender) || roleHas("admin", msg.sender), "User is not a super user");
        _;
    }


    /**
    * @dev Reverts if the address doesn't have this role
    */
    modifier onlyRole(string memory _role) {
        roleCheck(_role, msg.sender);
        _;
    }


    /*** Constructor ************/


    /// @dev Set the main Rocket Storage address
    constructor(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorage(_rocketStorageAddress);
    }


    /*** Contract Utilities *****/


    /// @dev Get the the contracts address - This method should be called before interacting with any API contracts to ensure the latest address is used
    function getContractAddress(string memory _contractName) public view returns(address) {
        // Get the current API contract address
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
        // Check it
        require(address(contractAddress) != address(0x0), "Rocket Pool - Contract not found.");
        // Done
        return contractAddress;
    }


    /*** Role Utilities *********/


    /**
    * @dev Check if an address has this role
    * @return bool
    */
    function roleHas(string memory _role, address _address) internal view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("access.role", _role, _address)));
    }


    /**
    * @dev Check if an address has this role, reverts if it doesn't
    */
    function roleCheck(string memory _role, address _address) view internal {
        require(roleHas(_role, _address) == true, "User does not have correct role");
    }


}
