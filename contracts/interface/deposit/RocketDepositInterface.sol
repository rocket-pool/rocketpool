pragma solidity 0.4.24;

/// @title Rocket Pool deposits
contract RocketDepositInterface {
    function getQueuedDepositCount(address _userID, address _groupID, string _durationID) public returns (uint256);
    function getQueuedDepositAt(address _userID, address _groupID, string _durationID, uint256 _index) public returns (bytes32);
    function create(address _userID, address _groupID, string _durationID) payable public returns (bool);
    function refund(address _userID, address _groupID, string _durationID, bytes32 _depositID, address _depositorAddress) public returns (bool);
    function assignChunks(string _durationID) public;
}
