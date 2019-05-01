pragma solidity 0.5.0;

contract RocketDepositIndexInterface {
    function add(address _userID, address _groupID, string memory _durationID, uint256 _amount) public returns (bytes32);
    function assign(bytes32 _depositID, address _minipool, uint256 _assignAmount) public;
    function refund(bytes32 _depositID, uint256 _refundAmount) public;
    function refundFromStalledMinipool(bytes32 _depositID, address _minipool, uint256 _refundAmount) public;
    function withdrawFromMinipool(bytes32 _depositID, address _minipool, uint256 _withdrawalAmount) public;
    function checkDepositDetails(address _userID, address _groupID, bytes32 _depositID, address _minipool) public;
}
