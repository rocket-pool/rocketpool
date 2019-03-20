pragma solidity 0.5.0;


contract RocketNodeContractInterface {
    function getOwner() public view returns(address);
    function getRewardsAddress() public view returns(address);
    function getHasDepositReservation() public view returns(bool);
    function getDepositReservedTime() public view returns(uint256);
    function getDepositReserveEtherRequired() public returns(uint256);
    function getDepositReserveRPLRequired() public returns(uint256);
    function getDepositReserveDurationID() public returns (string memory);
    function getDepositReserveDepositInput() public returns (bytes memory);
}