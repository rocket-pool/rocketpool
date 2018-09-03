pragma solidity 0.4.24; 


// Our node interface
contract RocketNodeAPIInterface {
    // Getters
    function getContract(address _nodeAddress) public view returns (address);
    function getDepositEtherIsValid(uint256 _value, address _from, string _durationID) public returns(bool);
    function getRPLRequired(uint256 _weiAmount, string _durationID) public returns(uint256);
}