pragma solidity 0.4.24;

contract RocketMinipoolSetInterface {
    function getNextActiveMinipool(string _durationID, uint256 _seed) public returns (address);
    function removeActiveMinipool(string _durationID, address _miniPoolAddress) public;
}
