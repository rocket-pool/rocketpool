pragma solidity 0.5.0;


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
            setCheckinGasPrice(20000000000);                                            // Set the gas price for node checkins in Wei (20 gwei)
            setDepositEtherGasLimit(100000);                                            // Set the gas limit for nodes transferring their ether to a minipool contract after it is created
            setDepositRPLGasLimit(250000);                                              // Set the gas limit for nodes transferring their RPL to a minipool contract after it is created
            setInactiveAutomatic(true);                                                 // Can nodes be set inactive automatically by the contract? they won't receive new users
            setInactiveDuration(48 hours);                                              // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
            setMaxInactiveNodeChecks(3);                                                // The maximum number of other nodes to check for inactivity on checkin
            setDepositAllowed(true);                                                    // Are deposits allowed by nodes?
            setDepositReservationTime(1 days);                                          // How long a deposit reservation stays valid for before the actual ether/rpl needs to be sent
            setWithdrawalAllowed(true);                                                 // Are withdrawals allowed by nodes?
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
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.account.ether.min")));
    }

    /// @dev Get the gas price for node checkins in Wei
    function getCheckinGasPrice() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.checkin.gas.price")));
    }

    /// @dev Get the gas limit for nodes transferring their ether to a minipool contract after it is created
    function getDepositEtherGasLimit() public view returns (uint256)  {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.deposit.ether.gas.limit"))); 
    }

    /// @dev Get the gas limit for nodes transferring their RPL to a minipool contract after it is created
    function getDepositRPLGasLimit() public view returns (uint256)  {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.deposit.rpl.gas.limit"))); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function getInactiveAutomatic() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.setinactive.automatic")));
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function getInactiveDuration() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.setinactive.duration"))); 
    }

    /// @dev The maximum number of other nodes to check for inactivity on checkin
    function getMaxInactiveNodeChecks() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.setinactive.checks.max"))); 
    }

    /// @dev Are deposits currently allowed?
    function getDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.deposit.allowed"))); 
    }

    /// @dev How long a deposit reservation stays valid for before the actual ether/rpl needs to be sent
    function getDepositReservationTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.node.deposit.reservation.time"))); 
    }

    /// @dev Are withdrawals currently allowed?
    function getWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.node.withdrawal.allowed"))); 
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
    function setCheckinGasPrice(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.checkin.gas.price")), _weiAmount); 
    }

    /// @dev Set the gas limit for nodes transferring their ether to a minipool contract after it is created
    function setDepositEtherGasLimit(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.deposit.ether.gas.limit")), _weiAmount); 
    }

    /// @dev Set the gas limit for nodes transferring their RPL to a minipool contract after it is created
    function setDepositRPLGasLimit(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.deposit.rpl.gas.limit")), _weiAmount); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function setInactiveAutomatic(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.setinactive.automatic")), _enable); 
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function setInactiveDuration(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.setinactive.duration")), _amount); 
    }

    /// @dev The maximum number of other nodes to check for inactivity on checkin
    function setMaxInactiveNodeChecks(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.setinactive.checks.max")), _amount); 
    }

    /// @dev Are user deposits currently allowed?
    function setDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.deposit.allowed")), _enabled); 
    }

    /// @dev How long a deposit reservation stays valid for before the actual ether/rpl needs to be sent
    function setDepositReservationTime(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.node.deposit.reservation.time")), _weiAmount); 
    }

    /// @dev Are withdrawals currently allowed?
    function setWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.node.withdrawal.allowed")), _enabled); 
    }

}
