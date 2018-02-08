pragma solidity 0.4.19;


contract RocketSettingsInterface {
    /// @dev Get the current average block time for the network
    function getAverageBlockTime() public view returns (uint256);
    /// @dev Are user deposits currently allowed?                                                 
    function getUserDepositAllowed() public view returns (bool);
    /// @dev Min required deposit in Wei 
    function getUserDepositMin() public view returns (uint256);
    /// @dev Max allowed deposit in Wei 
    function getUserDepositMax() public view returns (uint256);
    /// @dev Are withdrawals allowed?                                            
    function getUserWithdrawalAllowed() public view returns (bool);
    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function getUserWithdrawalMin() public view returns (uint256);
    /// @dev Max allowed to be withdrawn in Wei
    function getUserWithdrawalMax() public view returns (uint256);
    /// @dev Get default status of a new mini pool
    function getMiniPoolDefaultStatus() public view returns (uint256);
    /// @dev The minimum Wei required for a pool to launch
    function getMiniPoolLaunchAmount() public view returns (uint256);
    /// @dev The time limit to stay in countdown before staking begins
    function getMiniPoolCountDownTime() public view returns (uint256);
    /// @dev Check to see if new pools are allowed to be created
    function getMiniPoolAllowedToBeCreated() public view returns (bool);
    /// @dev Minipools allowed to be created?
    function getMiniPoolNewEnabled() public view returns (bool);
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getMiniPoolClosingEnabled() public view returns (bool);
    /// @dev Maximum amount of minipool contracts allowed
    function getMiniPoolMax() public view returns (uint256);
    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function getMiniPoolNewGas() public view returns (uint256);
    /// @dev The gas required for depositing with Casper and being added as a validator
    function getMiniPoolDepositGas() public view returns (uint256);
     /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getMiniPoolStakingTime(string _stakingTimeID) public view returns (uint256);
    /// @dev Get the minimum required time for staking
    function getMiniPoolMinimumStakingTime() public view returns (uint256);
    /// @dev The default fee given as a % of 1 Ether (eg 5%)    
    function getMiniPoolWithdrawalFeePerc() public view returns (uint256);
    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function getMiniPoolWithdrawalFeeDepositAddress() public view returns (address);
    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getMiniPoolBackupCollectEnabled() public view returns (bool);
    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getMiniPoolBackupCollectTime() public view returns (uint256);
    /// @dev The default fee given as a % of 1 Ether (eg 5%)
    function getTokenRPDWithdrawalFeePerc() public view returns (uint256);
    /// @dev Get the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function getSmartNodeEtherMin() public view returns (uint256);
    /// @dev Get the gas price for node checkins in Wei
    function getSmartNodeCheckinGas() public view returns (uint256);
    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function getSmartNodeSetInactiveAutomatic() public view returns (bool);
    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function getSmartNodeSetInactiveDuration() public view returns (uint256);
}