pragma solidity 0.5.8;

/// @title Rocket Pool deposits
contract RocketDepositInterface {
    function create(address _userID, address _groupID, string memory _durationID) payable public returns (bool);
    function refund(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, address _depositorAddress) public returns (uint256);
    function refundFromStalledMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, address _withdrawerAddress) public returns (uint256);
    function withdrawFromStakingMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, uint256 _amount, address _withdrawerAddress) public returns (uint256);
    function withdrawFromWithdrawnMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, address _withdrawerAddress) public returns (uint256);
    function setMinipoolUserBackupWithdrawalAddress(address _userID, address _groupID, address _minipool, address _backupWithdrawalAddress) public returns (bool);
}
