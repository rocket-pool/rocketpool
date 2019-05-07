pragma solidity 0.5.8;

contract RocketMinipoolSetInterface {
    function getNextActiveMinipool(string memory _durationID, uint256 _seed) public returns (address);
}
