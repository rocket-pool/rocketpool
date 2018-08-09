pragma solidity 0.4.24;


import "../../RocketBase.sol";


/// @title Settings for API in Rocket Pool
/// @author David Rugendyke
contract RocketAPISettings is RocketBase {


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
    }


    /// @dev Initialise after deployment to not exceed the gas block limit
    function init() public onlyOwner {
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.api.init")))) {

             /*** API ***/
            setDepositAllowed(true);                                                        // Are user deposits currently allowed?
            setDepositMin(0.5 ether);                                                       // Min required deposit in Wei 
            setDepositMax(1000 ether);                                                      // Max allowed deposit in Wei 
            setWithdrawalAllowed(true);                                                     // Are withdrawals allowed?
            setWithdrawalMin(0);                                                            // Min allowed to be withdrawn in Wei, 0 = all
            setWithdrawalMax(10 ether);                                                     // Max allowed to be withdrawn in Wei     

            rocketStorage.setBool(keccak256(abi.encodePacked("settings.init")), true);
        }
    }

    
    /*** Getters **********************/


    // Deposits

    /// @dev Are deposits currently allowed?                                                 
    function getDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.api.deposit.allowed"))); 
    }

    /// @dev Min required deposit in Wei 
    function getDepositMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.api.deposit.min"))); 
    }

    /// @dev Max allowed deposit in Wei 
    function getDepositMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.api.deposit.max"))); 
    }


    // Withdrawals

    /// @dev Are withdrawals allowed?                                            
    function getWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.api.withdrawal.allowed"))); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function getWithdrawalMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.api.withdrawal.min"))); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function getWithdrawalMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.api.withdrawal.max"))); 
    }



    /*** Setters **********************/


    // Deposits

    /// @dev Are user deposits currently allowed?                                                 
    function setDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.api.deposit.allowed")), _enabled); 
    }

    /// @dev Min required deposit in Wei 
    function setDepositMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.api.deposit.min")), _weiAmount); 
    }

    /// @dev Max allowed deposit in Wei 
    function setDepositMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.api.deposit.max")), _weiAmount); 
    }


    // Withdrawals

    /// @dev Are withdrawals allowed?                                            
    function setWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.api.withdrawal.allowed")), _enabled); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function setWithdrawalMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.api.withdrawal.min")), _weiAmount); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function setWithdrawalMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.api.withdrawal.max")), _weiAmount); 
    }


}
