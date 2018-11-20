pragma solidity 0.4.24;

contract RocketMinipoolSetInterface {
    function getNextActiveMinipool(string _durationID, uint256 _seed) public returns (address);
    function checkActiveMinipool(string _durationID, address _miniPoolAddress) public;
}
