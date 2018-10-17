pragma solidity 0.4.24;

/// @title Rocket Pool deposits
contract RocketDepositInterface {
    function create(address _userID, address _groupID, string _durationID) payable public returns (bool);
    function refund(address _userID, address _groupID, string _durationID, bytes32 _depositID, address _depositorAddress) public returns (uint256);
}
