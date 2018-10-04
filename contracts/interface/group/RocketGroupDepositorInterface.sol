pragma solidity ^0.4.24;

contract RocketGroupDepositorInterface {
    function receiveRocketpoolDepositRefund(address _groupID, address _userID, string _durationID, bytes32 _depositID) external payable returns (bool);
}
