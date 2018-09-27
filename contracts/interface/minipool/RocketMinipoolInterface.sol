pragma solidity 0.4.24;


contract RocketMinipoolInterface {
    // Getters
    function getNodeOwner() public view returns(address);
    function getNodeContract() public view returns(address);
    function getNodeDepositEther() public view returns(uint256);
    function getNodeDepositRPL() public view returns(uint256);
    function getNodeTrusted() public view returns(bool);
    function getUserCount() public view returns(uint256);
    function getStatus() public view returns(uint8);
    function getStakingDuration() public view returns(uint256);
    // Methods
    function nodeDeposit() public payable returns(bool);
    function closePool() public returns(bool);
}