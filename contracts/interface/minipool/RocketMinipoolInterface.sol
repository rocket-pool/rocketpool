pragma solidity 0.5.8;


contract RocketMinipoolInterface {
    // Getters
    function getNodeOwner() public view returns(address);
    function getNodeContract() public view returns(address);
    function getNodeDepositEther() public view returns(uint256);
    function getNodeDepositRPL() public view returns(uint256);
    function getNodeTrusted() public view returns(bool);
    function getNodeDepositExists() public view returns(bool);
    function getNodeBalance() public view returns(uint256);
    function getNodeUserFee() public view returns(uint256);
    function getDepositCount() public view returns(uint256);
    function getDepositExists(bytes32 _depositID) public view returns(bool);
    function getDepositUserID(bytes32 _depositID) public view returns(address);
    function getDepositGroupID(bytes32 _depositID) public view returns(address);
    function getDepositBalance(bytes32 _depositID) public view returns(uint256);
    function getDepositStakingTokensWithdrawn(bytes32 _depositID) public view returns(uint256);
    function getDepositFeeRP(bytes32 _depositID) public view returns(uint256);
    function getDepositFeeGroup(bytes32 _depositID) public view returns(uint256);
    function getDepositCreated(bytes32 _depositID) public view returns(uint256);
    function getStatus() public view returns(uint8);
    function getStatusChangedTime() public view returns(uint256);
    function getStatusChangedBlock() public view returns(uint256);
    function getStakingDurationID() public view returns (string memory);
    function getStakingDuration() public view returns(uint256);
    function getStakingBalanceStart() public view returns(uint256);
    function getStakingBalanceEnd() public view returns(uint256);
    function getValidatorPubkey() public view returns (bytes memory);
    function getValidatorSignature() public view returns (bytes memory);
    function getUserDepositCapacity() public view returns(uint256);
    function getUserDepositTotal() public view returns(uint256);
    function getStakingUserDepositsWithdrawn() public view returns(uint256);
    // Methods
    function nodeDeposit() public payable returns(bool);
    function nodeWithdraw() public returns(bool);
    function deposit(bytes32 _depositID, address _userID, address _groupID) public payable returns(bool);
    function refund(bytes32 _depositID, address _refundAddress) public returns(bool);
    function withdrawStaking(bytes32 _depositID, uint256 _withdrawnAmount, uint256 _tokenAmount, address _withdrawnAddress) public returns(bool);
    function withdraw(bytes32 _depositID, address _withdrawalAddress) public returns(bool);
    function updateStatus() public returns(bool);
    function logoutMinipool() public returns (bool);
    function withdrawMinipool(uint256 _withdrawalBalance) public returns (bool);
}
