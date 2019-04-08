pragma solidity 0.5.0;

contract RocketDepositIndexInterface {
	function add(address _userID, address _groupID, string memory _durationID, uint256 _amount) public returns (bytes32);
}
