pragma solidity 0.5.0; 


// Our API interface
contract RocketDepositAPIInterface {
    // Getters
    function getUserQueuedDepositCount(address _groupID, address _userID, string memory _durationID) public returns (uint256);
    function getUserQueuedDepositAt(address _groupID, address _userID, string memory _durationID, uint256 _index) public returns (bytes32);
    function getUserQueuedDepositBalance(bytes32 _depositID) public view returns (uint256);
    // Methods
    function deposit(address _groupID, address _userID, string memory _durationID) public payable returns(bool);
    function refundDepositQueued(address _groupID, address _userID, string memory _durationID, bytes32 _depositID) public returns(uint256);
    function refundDepositMinipoolStalled(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function withdrawDepositMinipoolStaking(address _groupID, address _userID, bytes32 _depositID, address _minipool, uint256 _amount) public returns(uint256);
    function withdrawDepositMinipool(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
    function setMinipoolUserBackupWithdrawalAddress(address _groupID, address _userID, address _minipool, address _backupWithdrawalAddress) public returns(bool);
}
