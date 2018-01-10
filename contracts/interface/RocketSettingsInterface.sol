pragma solidity 0.4.18;


contract RocketSettingsInterface {
    /// @dev Get default status of a new mini pool
    function getPoolDefaultStatus() public view returns (uint256);
    /// @dev Check to see if new pools are allowed to be created
    function getPoolAllowedToBeCreated() public view returns (bool);
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getPoolAllowedToBeClosed() public view returns (bool);
     /// @dev Get the minimum time allowed for staking with Casper
    function getPoolMinEtherRequired() public view returns (uint256);
    /// @dev Get the time limit to stay in countdown before staking begins
    function getPoolCountdownTime() public view returns (uint256);
    /// @dev Check to see if the supplied staking time is a set time
    function getPoolStakingTimeExists(string _stakingTimeID) public view returns (bool);
    /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getPoolStakingTime(string _stakingTimeID) public view returns (uint256);
    /// @dev Get the gas amount required to create a minipool contract upon deposit
    function getPoolMiniCreationGas() public view returns (uint256);
    /// @dev Get the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getWithdrawalFeePercInWei() public view returns (uint256);
    /// @dev Get the Rocket Pool withdrawal fee address (defaults to RocketHub)
    function getWithdrawalFeeDepositAddress() public view returns (address);
    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getPoolUserBackupCollectEnabled() public view returns (bool);
    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getPoolUserBackupCollectTime() public view returns (uint256);
    /// @dev The Rocket Pool deposit token withdrawal fee, given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getDepositTokenWithdrawalFeePercInWei() public view returns (uint256);
    /// @dev Get the min eth needed for a node account to cover gas costs
    function getNodeMinWei() public view returns (uint256);
    /// @dev Get the gas price for node checkins in Wei
    function getNodeCheckinGasPriceWei() public view returns (uint256);
    /// @dev Are nodes allowed to be set inactive by Rocket Pool automatically
    function getNodeSetInactiveAutomatic() public view returns (bool);
    /// @dev Get the gas price for node checkins in Wei
    function getNodeSetInactiveDuration() public view returns (uint256);
}