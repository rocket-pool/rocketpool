pragma solidity 0.4.24;


contract RocketMinipoolInterface {
    // Getters
    function getOwner() public view returns(address);
    function getNodeContract() public view returns(address);
    function getNodeDepositEther() public view returns(uint256);
    function getNodeDepositRPL() public view returns(uint256);
    // Methods
    function nodeDeposit() public payable returns(bool);
}