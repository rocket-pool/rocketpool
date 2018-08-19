pragma solidity 0.4.24;


// Our eternal storage interface
contract RocketHelpersAPIInterface {
    // Deposits
    function getDepositAddress() public returns(address);
    function getDepositIsValid(uint256 _value, address _from, string _groupID, address _userID, string _durationID) public returns(bool);
    // Withdrawals
    function getWithdrawalAddress() public returns(address);
    // Groups
    function getGroupName(string _groupID) public returns(address);
}
