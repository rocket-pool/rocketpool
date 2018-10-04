pragma solidity 0.4.24;


import "../../RocketBase.sol";
// Interfaces
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";


/// @title Settings for API in Rocket Pool
/// @author David Rugendyke
contract RocketDepositSettings is RocketBase {


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.init")))) {
            // API Settings
            setDepositAllowed(true);                                                        // Are user deposits currently allowed?
            setDepositChunkSize(4 ether);                                                   // The size of a deposit chunk
            setDepositMin(0.5 ether);                                                       // Min required deposit in Wei 
            setDepositMax(1000 ether);                                                      // Max allowed deposit in Wei 
            setChunkAssignMax(2);                                                           // Max chunk assignments per transaction
            setRefundDepositAllowed(true);                                                  // Are user deposit refunds currently allowed?
            setWithdrawalAllowed(true);                                                     // Are withdrawals allowed?
            setWithdrawalMin(0);                                                            // Min allowed to be withdrawn in Wei, 0 = all
            setWithdrawalMax(10 ether);                                                     // Max allowed to be withdrawn in Wei     
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.init")), true);
        }
    }

    
    /*** Getters **********************/


    // Deposits

    /// @dev Are deposits currently allowed?                                                 
    function getDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.allowed"))); 
    }

    /// @dev The size of deposit chunks
    function getDepositChunkSize() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.deposit.chunk.size"))); 
    }

    /// @dev Min required deposit in Wei 
    function getDepositMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.deposit.min"))); 
    }

    /// @dev Max allowed deposit in Wei 
    function getDepositMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.deposit.max"))); 
    }

    /// @dev Max number of chunk assignments per transaction
    function getChunkAssignMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.deposit.chunk.assignMax"))); 
    }

    /// @dev Are user deposit refunds currently allowed?
    function getRefundDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.refund.allowed")));
    }


    // Withdrawals

    /// @dev Are withdrawals allowed?                                            
    function getWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.withdrawal.allowed"))); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function getWithdrawalMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.withdrawal.min"))); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function getWithdrawalMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.withdrawal.max"))); 
    }



    /*** Setters **********************/


    // Deposits

    /// @dev Are user deposits currently allowed?                                                 
    function setDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.allowed")), _enabled); 
    }

    /// @dev Deposit chunk size - must be evenly divisible on the minipool size
    function setDepositChunkSize(uint256 _weiAmount) public onlySuperUser {
        // Is the deposit chunk evenly divisible on the minipool limit? It must be
        require(rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.launch.wei"))) % _weiAmount == 0, "Chunk size not fully divisible in minipool launch amount.");
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.deposit.chunk.size")), _weiAmount); 
    }

    /// @dev Min required deposit in Wei 
    function setDepositMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.deposit.min")), _weiAmount); 
    }

    /// @dev Max allowed deposit in Wei 
    function setDepositMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.deposit.max")), _weiAmount); 
    }

    /// @dev Max number of chunk assignments per transaction
    function setChunkAssignMax(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.deposit.chunk.assignMax")), _amount); 
    }

    /// @dev Are user deposit refunds currently allowed?
    function setRefundDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.refund.allowed")), _enabled);
    }


    // Withdrawals

    /// @dev Are withdrawals allowed?                                            
    function setWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.withdrawal.allowed")), _enabled); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function setWithdrawalMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.withdrawal.min")), _weiAmount); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function setWithdrawalMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.withdrawal.max")), _weiAmount); 
    }


}
