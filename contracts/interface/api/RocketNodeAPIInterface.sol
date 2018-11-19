pragma solidity 0.4.24; 


// Our node interface
contract RocketNodeAPIInterface {
    // Getters
    function getContract(address _nodeAddress) public view returns (address);
    function checkDepositReservationIsValid(address _from, uint256 _value, string _durationID, uint256 _lastDepositReservedTime) public;
    function getRPLRatio(string _durationID) public returns(uint256);
    function getRPLRequired(uint256 _weiAmount, string _durationID) public returns(uint256, uint256);
    // Methods
    function add(string _timezoneLocation) public returns (bool);
    function deposit(address _nodeOwner) public returns(address[]);
}