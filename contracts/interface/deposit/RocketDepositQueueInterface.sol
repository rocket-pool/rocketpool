pragma solidity 0.5.8;

/// @title Rocket Pool deposit queue
contract RocketDepositQueueInterface {
    function getBalance(string memory _durationID) public view returns (uint256);
    function enqueueDeposit(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, uint256 _amount) public;
    function removeDeposit(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, uint256 _amount) public;
    function assignChunks(string memory _durationID) public;
}
