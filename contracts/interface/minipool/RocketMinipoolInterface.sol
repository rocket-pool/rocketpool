pragma solidity 0.5.0;


contract RocketMinipoolInterface {
    // Getters
    function getNodeOwner() public view returns(address);
    function getNodeContract() public view returns(address);
    function getNodeDepositEther() public view returns(uint256);
    function getNodeDepositRPL() public view returns(uint256);
    function getNodeTrusted() public view returns(bool);
    function getNodeDepositExists() public view returns(bool);
    function getNodeBalance() public view returns(uint256);
    function getUserCount() public view returns(uint256);
    function getUserExists(address _user) public view returns(bool);
    function getUserDeposit(address _user) public view returns(uint256);
    function getStatus() public view returns(uint8);
    function getStatusChangedTime() public view returns(uint256);
    function getStatusChangedBlock() public view returns(uint256);
    function getStakingDurationID() public view returns (string memory);
    function getStakingDuration() public view returns(uint256);
    // Methods
    function nodeDeposit() public payable returns(bool);
    function nodeWithdraw() public returns(bool);
    function deposit(address _user, address _groupID) public payable returns(bool);
    function withdraw(address _user, address _groupID, address _withdrawalAddress) public returns(bool);
    function updateStatus() public returns(bool);
}
