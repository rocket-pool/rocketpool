pragma solidity 0.4.24;

/// @title Rocket Pool deposits
contract RocketDepositInterface {
    function create(address _userID, address _groupID, string _stakingDurationID) payable public returns (bool);
    function assignChunks(string _stakingDurationID) public;
}
