pragma solidity 0.4.24;


contract RocketMinipoolFactoryInterface {
    function createRocketMinipool(address _nodeOwner, uint256 _duration) public returns(address);
}