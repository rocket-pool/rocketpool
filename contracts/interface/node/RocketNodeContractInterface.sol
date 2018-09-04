pragma solidity 0.4.24;


contract RocketNodeContractInterface {
    function getLastDepositReservedTime() public view returns(uint256);
    function getDepositReserveEtherRequired() public returns(uint256);
    function getDepositReserveRPLRequired() public returns(uint256);
    function getDepositReserveDurationID() public returns(string);
}