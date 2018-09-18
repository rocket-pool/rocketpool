pragma solidity 0.4.24;


contract RocketPoolInterface {
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external returns (address);
    function minipoolDestroyCheck(address _sender, address _minipool) public returns (bool);
}
