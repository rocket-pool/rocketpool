pragma solidity 0.4.24;


contract RocketMinipoolFactoryInterface {
    function createRocketMinipool(address _nodeOwner, uint256 _duration, uint256 _etherDeposited, uint256 _rplDeposited, bool _trusted) public returns(address);
}