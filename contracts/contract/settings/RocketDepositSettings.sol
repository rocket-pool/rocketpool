pragma solidity 0.5.8;


import "../../RocketBase.sol";
// Interfaces
import "../../interface/RocketNodeInterface.sol";
import "../../interface/deposit/RocketDepositQueueInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title Settings for API in Rocket Pool
/// @author David Rugendyke
contract RocketDepositSettings is RocketBase {


    /*** Libs  *****************/

    using SafeMath for uint;


    /*** Contracts **************/


    RocketDepositQueueInterface rocketDepositQueue = RocketDepositQueueInterface(0);
    RocketNodeInterface rocketNode = RocketNodeInterface(0);


    /*** Constructor ************/


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.init")))) {
            // API Settings
            setDepositAllowed(true);                                                        // Are user deposits currently allowed?
            setProcessDepositQueueAllowed(true);                                            // Is processing the deposit queue currently allowed?
            setDepositChunkSize(4 ether);                                                   // The size of a deposit chunk
            setDepositMin(1 ether);                                                         // Min required deposit in Wei 
            setDepositMax(1000 ether);                                                      // Max allowed deposit in Wei 
            setChunkAssignMax(2);                                                           // Max chunk assignments per transaction
            setDepositQueueSizeMax(1600 ether);                                             // Maximum deposit queue size in Wei
            setRefundDepositAllowed(true);                                                  // Are user deposit refunds currently allowed?
            setStakingWithdrawalAllowed(false);                                             // Are withdrawals from staking minipools allowed?
            setWithdrawalAllowed(true);                                                     // Are withdrawals from exited minipools allowed?
            setStakingWithdrawalFeePerc(0.0025 ether);                                      // The staking withdrawal fee given as a % of 1 Ether (eg 0.25%)
            // Initialise settings
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.init")), true);
        }
    }

    
    /*** Getters ****************/


    // Deposits

    /// @dev Are deposits currently allowed?                                                 
    function getDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.allowed"))); 
    }

    /// @dev Is processing the deposit queue currently allowed?
    function getProcessDepositQueueAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.queue.process.allowed")));
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

    /// @dev Maximum deposit queue size in Wei
    function getDepositQueueSizeMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.deposit.queue.max")));
    }

    /// @dev Are user deposit refunds currently allowed?
    function getRefundDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.deposit.refund.allowed")));
    }

    /// @dev Get the current max allowed deposit in Wei (based on queue size and node availability)
    function getCurrentDepositMax(string memory _durationID) public returns (uint256) {

        // Max size deposits (or deposits <= remaining queue capacity) allowed if deposit queue is under max size
        rocketDepositQueue = RocketDepositQueueInterface(getContractAddress("rocketDepositQueue"));
        if (rocketDepositQueue.getBalance(_durationID) < getDepositQueueSizeMax()) {
            uint256 queueCapacity = getDepositQueueSizeMax().sub(rocketDepositQueue.getBalance(_durationID));
            uint256 maxDepositSize = getDepositMax();
            if (queueCapacity < maxDepositSize) { return queueCapacity; }
            else { return maxDepositSize; }
        }

        // Deposits up to ( (max chunk assignments - 1) * chunk size ) allowed if nodes are available
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        if (rocketNode.getAvailableNodeCount(_durationID) > 0) {
            return (getChunkAssignMax() - 1) * getDepositChunkSize();
        }

        // Deposits disabled if no nodes are available
        return 0;

    }


    // Withdrawals

    /// @dev Are withdrawals from staking minipools allowed?
    function getStakingWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.withdrawal.staking.allowed")));
    }

    /// @dev Are withdrawals from exited minipools allowed?
    function getWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.withdrawal.allowed")));
    }

    /// @dev The staking withdrawal fee given as a % of 1 Ether (eg 0.25%)
    function getStakingWithdrawalFeePerc() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.withdrawal.staking.fee"))); 
    }



    /*** Setters ****************/


    // Deposits

    /// @dev Are user deposits currently allowed?                                                 
    function setDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.allowed")), _enabled); 
    }

    /// @dev Is processing the deposit queue currently allowed?
    function setProcessDepositQueueAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.queue.process.allowed")), _enabled);
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

    /// @dev Maximum deposit queue size in Wei
    function setDepositQueueSizeMax(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.deposit.queue.max")), _amount); 
    }

    /// @dev Are user deposit refunds currently allowed?
    function setRefundDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.deposit.refund.allowed")), _enabled);
    }


    // Withdrawals


    /// @dev Are withdrawals from staking minipools allowed?
    function setStakingWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.withdrawal.staking.allowed")), _enabled);
    }

    /// @dev Are withdrawals from exited minipools allowed?
    function setWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.withdrawal.allowed")), _enabled);
    }

    /// @dev The staking withdrawal fee given as a % of 1 Ether (eg 0.25%)
    function setStakingWithdrawalFeePerc(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.withdrawal.staking.fee")), _amount);
    }


}
