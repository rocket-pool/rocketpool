pragma solidity 0.4.24;

/// @title Rocket Pool deposit queue
contract RocketDepositQueueInterface {
    function getBalance(string _durationID) public view returns (uint256);
    function enqueueDeposit(address _userID, address _groupID, string _durationID, bytes32 _depositID, uint256 _amount) public;
    function removeDeposit(address _userID, address _groupID, string _durationID, bytes32 _depositID, uint256 _amount) public;
    function assignChunks(string _durationID) public;
}
