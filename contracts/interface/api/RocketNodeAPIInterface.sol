pragma solidity 0.5.0; 


// Our node interface
contract RocketNodeAPIInterface {
    // Getters
    function getContract(address _nodeAddress) public view returns (address);
    function checkDepositReservationIsValid(address _nodeOwner, string memory _durationID, bytes memory _depositInput, uint256 _lastDepositReservedTime) public;
    function getRPLRatio(string memory _durationID) public returns(uint256);
    function getRPLRequired(uint256 _weiAmount, string memory _durationID) public returns(uint256, uint256);
    // Methods
    function add(string memory _timezoneLocation) public returns (bool);
    function deposit(address _nodeOwner) public returns(address);
    function checkin(address _nodeOwner, uint256 _averageLoad, uint256 _nodeFeeVote) public returns(bool);
}