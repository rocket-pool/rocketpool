pragma solidity 0.4.24; 


// Our API interface
contract RocketDepositAPIInterface {
    // Getters
    function getDepositIsValid(uint256 _value, address _from, address _groupID, address _userID, string _durationID) public returns(bool);
    function getDepositRefundIsValid(address _from, address _groupID, address _userID, string _durationID) public returns(bool);
    function getUserQueuedDepositCount(address _groupID, address _userID, string _durationID) public returns (uint256);
    function getUserQueuedDepositAt(address _groupID, address _userID, string _durationID, uint256 _index) public returns (bytes32);
    // Methods
    function deposit(address _groupID, address _userID, string _durationID) public payable returns(bool);
    function refundDeposit(address _groupID, address _userID, string _durationID, bytes32 _depositID) public returns(bool);
}
