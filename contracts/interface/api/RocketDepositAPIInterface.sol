pragma solidity 0.4.24; 


// Our API interface
contract RocketDepositAPIInterface {
    // Getters
    function getDepositIsValid(uint256 _value, address _from, address _groupID, address _userID, string _durationID) public returns(bool);
    // Methods
    function deposit(address _groupID, address _userID, string _durationID) public payable returns(bool);
}
