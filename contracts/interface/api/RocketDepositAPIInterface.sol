pragma solidity 0.4.24; 


// Our API interface
contract RocketDepositAPIInterface {
    // Getters
    function getUserQueuedDepositCount(address _groupID, address _userID, string _durationID) public returns (uint256);
    function getUserQueuedDepositAt(address _groupID, address _userID, string _durationID, uint256 _index) public returns (bytes32);
    function getUserQueuedDepositBalance(bytes32 _depositID) public view returns (uint256);
    // Methods
    function deposit(address _groupID, address _userID, string _durationID) public payable returns(bool);
    function refundDeposit(address _groupID, address _userID, string _durationID, bytes32 _depositID) public returns(uint256);
    function withdrawMinipoolDeposit(address _groupID, address _userID, bytes32 _depositID, address _minipool) public returns(uint256);
}
