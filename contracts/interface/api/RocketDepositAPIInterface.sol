pragma solidity 0.5.0; 


// Our API interface
contract RocketDepositAPIInterface {
    function deposit(address _groupID, address _userID, string memory _durationID) public payable returns(bool);
    function refundDepositQueued(address _groupID, address _userID, string memory _durationID, bytes32 _depositID) public returns(uint256);
    function refundDepositMinipoolStalled(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function withdrawDepositMinipoolStaking(address _groupID, address _userID, bytes32 _depositID, address _minipool, uint256 _amount) public returns(uint256);
    function withdrawDepositMinipool(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function setMinipoolUserBackupWithdrawalAddress(address _groupID, address _userID, address _minipool, address _backupWithdrawalAddress) public returns(bool);
}
