pragma solidity ^0.4.24;

contract RocketGroupWithdrawerInterface {
    function receiveRocketpoolWithdrawal() external payable returns (bool);
}
