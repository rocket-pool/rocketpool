pragma solidity 0.4.24;


import "../../RocketBase.sol";


/// @title Settings for Groups in Rocket Pool
/// @author David Rugendyke
contract RocketGroupSettings is RocketBase {


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.group.init")))) {
            // Group Settings
            setDefaultFee(0.2 ether);                                                           // The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)
            setNewAllowed(true);                                                                // Are new groups allowed to be added
            setNewFee(0.1 ether);                                                               // The amount of ether required to register a new group 
            setNewFeeAddress(msg.sender);                                                       // The address to send the new group fee too
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.group.init")), true);
        }
    }


    
    /*** Getters **********************/


    /// @dev The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)                                              
    function getDefaultFee() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.group.fee.default"))); 
    }

    /// @dev Are new groups allowed to be added                             
    function getNewAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.group.new.allowed"))); 
    }

    /// @dev Fee required for new groups to be added                      
    function getNewFee() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.group.new.fee"))); 
    }

    /// @dev Address where the fee will be sent                      
    function getNewFeeAddress() public view returns (address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("settings.group.new.fee.address"))); 
    }


    /*** Setters **********************/

    /// @dev The default fee Rocket Pool charges given as a % of 1 Ether (eg 0.02 ether = 2%)                                              
    function setDefaultFee(uint256 _weiAmount) public onlySuperUser {
        require(_weiAmount >= 0, "Default fee cannot be less than 0.");
        require(_weiAmount <= 1 ether, "Default fee cannot be greater than 100%.");
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.group.fee.default")), _weiAmount); 
    }

    /// @dev Are new groups allowed to be added                                                   
    function setNewAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.group.new.allowed")), _enabled); 
    }

    /// @dev Fee required for new groups to be added                                              
    function setNewFee(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.group.new.fee")), _weiAmount); 
    }

    /// @dev Address where the fee will be sent                                                    
    function setNewFeeAddress(address _address) public onlySuperUser {
        rocketStorage.setAddress(keccak256(abi.encodePacked("settings.group.new.fee.address")), _address); 
    }

}
