pragma solidity 0.5.8;


// Our minipool interface
contract RocketMinipoolSettingsInterface {
    // Getters
    function getMinipoolLaunchAmount() public view returns (uint256);
    function getMinipoolCanBeCreated() public returns (bool);
    function getMinipoolNewEnabled() public view returns (bool);
    function getMinipoolClosingEnabled() public view returns (bool);
    function getMinipoolMax() public view returns (uint256);
    function getMinipoolNewGas() public view returns (uint256);
    function getMinipoolDepositGas() public view returns (uint256);
    function getMinipoolStakingDurationCount() public view returns (uint256);
    function getMinipoolStakingDurationAt(uint256 _index) public view returns (string memory);
    function getMinipoolStakingDurationExists(string memory _duration) public view returns (bool);
    function getMinipoolStakingDurationEpochs(string memory _duration) public view returns (uint256);
    function getMinipoolStakingDurationEnabled(string memory _duration) public view returns (bool);
    function getMinipoolCheckInterval() public view returns (uint256);
    function getMinipoolWithdrawalFeeDepositAddress() public view returns (address);
    function getMinipoolBackupCollectEnabled() public view returns (bool);
    function getMinipoolBackupCollectDuration() public view returns (uint256);
    function getMinipoolTimeout() public view returns (uint256);
    function getMinipoolActiveSetSize() public view returns (uint256);
}
