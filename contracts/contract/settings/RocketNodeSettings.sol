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
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.init")))) {
            // Node Settings            
            setNewAllowed(true);                                                        // Are new nodes allowed to be added                      
            setEtherMin(5 ether);                                                       // Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
            setCheckinGas(20000000000);                                                 // Set the gas price for node checkins in Wei (20 gwei)
            setInactiveAutomatic(true);                                                 // Can nodes be set inactive automatically by the contract? they won't receive new users
            setInactiveDuration(1 hours);                                               // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
            setDepositAllowed(true);                                                    // Are deposits allowed by nodes?
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.init")), true);
        }
    }


    
    /*** Getters **********************/

    /// @dev Are new nodes allowed to be added                             
    function getNewAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.new.allowed"))); 
    }

    /// @dev Get the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function getEtherMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.node.account.ether.min"));
    }

    /// @dev Get the gas price for node checkins in Wei
    function getCheckinGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.node.checkin.gas"));
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function getInactiveAutomatic() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.node.setinactive.automatic"));
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function getInactiveDuration() public view returns (uint256) {
        rocketStorage.getUint(keccak256("settings.node.setinactive.duration")); 
    }

    /// @dev Are deposits currently allowed?                                                 
    function getDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.deposit.allowed"))); 
    }


    /*** Setters **********************/

    /// @dev Are new nodes allowed to be added                             
    function setNewAllowed(bool _enable) public onlySuperUser { 
        return rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.new.allowed")), _enable); 
    }

     /// @dev Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function setEtherMin(uint256 _weiAmount) public onlySuperUser { 
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.account.ether.min")), _weiAmount); 
    }

    /// @dev Set the gas price for node checkins in Wei
    function setCheckinGas(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.checkin.gas")), _weiAmount); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function setInactiveAutomatic(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.setinactive.automatic")), _enable); 
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function setInactiveDuration(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.setinactive.duration")), _amount); 
    }

    /// @dev Are user deposits currently allowed?                                                 
    function setDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.deposit.allowed")), _enabled); 
    }

}
