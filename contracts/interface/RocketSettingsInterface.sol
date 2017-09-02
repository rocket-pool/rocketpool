pragma solidity ^0.4.15;

contract RocketSettingsInterface {
    /// @dev Get default status of a new mini pool
    function getPoolDefaultStatus() public constant returns (uint256);
    /// @dev Check to see if new pools are allowed to be created
    function getPoolAllowedToBeCreated() public constant returns (bool);
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getPoolAllowedToBeClosed() public constant returns (bool);
     /// @dev Get the minimum time allowed for staking with Casper
    function getPoolMinEtherRequired() public constant returns (uint256);
    /// @dev Get the time limit to stay in countdown before staking begins
    function getPoolCountdownTime() public constant returns (uint256);
    /// @dev Check to see if the supplied staking time is a set time
    function getPoolStakingTimeExists(bytes32 stakingTimeID) public constant returns (bool);
    /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getPoolStakingTime(bytes32 stakingTimeID) public constant returns (uint256);
    /// @dev Get the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getWithdrawalFeePercInWei() public constant returns (uint256);
    /// @dev Get the Rocket Pool withdrawal fee address (defaults to RocketHub)
    function getWithdrawalFeeDepositAddress() public constant returns (address);
    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getPoolUserBackupCollectEnabled() public constant returns (bool);
    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getPoolUserBackupCollectTime() public constant returns (uint256);
    /// @dev The Rocket Pool deposit token withdrawal fee, given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getDepositTokenWithdrawalFeePercInWei() public constant returns (uint256);
}