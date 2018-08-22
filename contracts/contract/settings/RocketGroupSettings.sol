pragma solidity 0.4.24;


import "../../RocketBase.sol";


/// @title Settings for Groups in Rocket Pool
/// @author David Rugendyke
contract RocketGroupSettings is RocketBase {


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
    }


    /// @dev Initialise after deployment to not exceed the gas block limit
    function init() public onlyOwner {
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.groups.init")))) {
            // Group Settings
            setDefaultFee(0.2 ether);                                                       // The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)
            setNewAllowed(true);                                                            // Are new groups allowed to be added
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.groups.init")), true);
        }
    }

    
    /*** Getters **********************/


    /// @dev The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)                                              
    function getDefaultFee() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.groups.fee.default"))); 
    }

     /// @dev Are new groups allowed to be added                             
    function getNewAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.groups.new.allowed"))); 
    }


    /*** Setters **********************/

    /// @dev The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)                                              
    function setDefaultFee(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.groups.fee.default")), _weiAmount); 
    }

    /// @dev Are new groups allowed to be added                                                   
    function setNewAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.groups.new.allowed")), _enabled); 
    }

    

}
