pragma solidity 0.4.24; 


// Our node interface
contract RocketNodeAPIInterface {
    // Getters
    function getContract(address _nodeAddress) public view returns (address);
    function getDepositIsValid(address _nodeContract) public returns(bool);
    function getDepositReservationIsValid(address _from, uint256 _value, string _durationID, uint256 _rplRatio, uint256 _lastDepositReservedTime) public returns(bool);
    function getRPLRatio(string _durationID) public returns(uint256);
    function getRPLRequired(uint256 _weiAmount, string _durationID) public view returns(uint256);
}