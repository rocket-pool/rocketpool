pragma solidity 0.4.24;


contract RocketMinipoolFactoryInterface {
    function createRocketMinipool(address _nodeOwner, string _durationID, uint256 _etherDeposited, uint256 _rplDeposited, bool _trusted) public returns(address);
}