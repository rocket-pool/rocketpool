pragma solidity 0.4.24;


import "../../RocketBase.sol";


/// @title Settings for Groups in Rocket Pool
/// @author David Rugendyke
contract RocketNodeSettings is RocketBase {


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.smartnode.init")))) {
            // Node Settings                                  
            setSmartNodeEtherMin(5 ether);                                                      // Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
            setSmartNodeCheckinGas(20000000000);                                                // Set the gas price for node checkins in Wei (20 gwei)
            setSmartNodeSetInactiveAutomatic(true);                                             // Can nodes be set inactive automatically by the contract? they won't receive new users
            setSmartNodeSetInactiveDuration(1 hours);                                           // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.smartnode.init")), true);
        }
    }


    
    /*** Getters **********************/


    /// @dev Get the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function getSmartNodeEtherMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.smartnode.account.ether.min"));
    }

    /// @dev Get the gas price for node checkins in Wei
    function getSmartNodeCheckinGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.smartnode.checkin.gas"));
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function getSmartNodeSetInactiveAutomatic() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.smartnode.setinactive.automatic"));
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function getSmartNodeSetInactiveDuration() public view returns (uint256) {
        rocketStorage.getUint(keccak256("settings.smartnode.setinactive.duration")); 
    }


    /*** Setters **********************/

     /// @dev Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function setSmartNodeEtherMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.account.ether.min"), _weiAmount); 
    }

    /// @dev Set the gas price for node checkins in Wei
    function setSmartNodeCheckinGas(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.checkin.gas"), _weiAmount); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function setSmartNodeSetInactiveAutomatic(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.smartnode.setinactive.automatic"), _enable); 
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function setSmartNodeSetInactiveDuration(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.setinactive.duration"), _amount); 
    }

}
