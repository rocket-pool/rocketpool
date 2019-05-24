pragma solidity 0.5.8; 


// Our API interface
contract RocketDepositAPIInterface {
    function deposit(address _groupID, address _userID, string memory _durationID) public payable returns(bool);
    function depositRefundQueued(address _groupID, address _userID, string memory _durationID, bytes32 _depositID) public returns(uint256);
    function depositRefundMinipoolStalled(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function depositWithdrawMinipoolStaking(address _groupID, address _userID, bytes32 _depositID, address _minipool, uint256 _amount) public returns(uint256);
    function depositWithdrawMinipool(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function setDepositBackupWithdrawalAddress(address _groupID, address _userID, bytes32 _depositID, address _backupWithdrawalAddress) public returns(bool);
}
