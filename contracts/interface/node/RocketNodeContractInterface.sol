pragma solidity 0.5.8;


contract RocketNodeContractInterface {
    function getOwner() public view returns(address);
    function getRewardsAddress() public view returns(address);
    function getHasDepositReservation() public view returns(bool);
    function getDepositReservedTime() public view returns(uint256);
    function getDepositReserveEtherRequired() public returns(uint256);
    function getDepositReserveRPLRequired() public returns(uint256);
    function getDepositReserveDurationID() public returns (string memory);
    function getDepositReserveValidatorPubkey() public returns (bytes memory);
    function getDepositReserveValidatorSignature() public returns (bytes memory);
    function getDepositReserveValidatorDepositDataRoot() public returns (bytes32);
}