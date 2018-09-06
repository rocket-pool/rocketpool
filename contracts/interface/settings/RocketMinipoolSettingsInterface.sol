pragma solidity 0.4.24;


// Our minipool interface
contract RocketMinipoolSettingsInterface {
    // Getters
    function getMinipoolDefaultStatus() public view returns (uint256);
    function getMinipoolLaunchAmount() public view returns (uint256);
    function getMinipoolCountDownTime() public view returns (uint256);
    function getMinipoolCanBeCreated() public view returns (bool);
    function getMinipoolNewEnabled() public view returns (bool);
    function getMinipoolNewMaxAtOnce() public view returns (uint256);
    function getMinipoolClosingEnabled() public view returns (bool);
    function getMinipoolMax() public view returns (uint256);
    function getMinipoolNewGas() public view returns (uint256);
    function getMinipoolDepositGas() public view returns (uint256);
    function getMinipoolStakingDuration(string _durationID) public view returns (uint256);
    function getMinipoolMinimumStakingTime() public view returns (uint256);
    function getMinipoolWithdrawalFeePerc() public view returns (uint256);
    function getMinipoolWithdrawalFeeDepositAddress() public view returns (address);
    function getMinipoolBackupCollectEnabled() public view returns (bool);
    function getMinipoolBackupCollectDuration() public view returns (uint256);
}
