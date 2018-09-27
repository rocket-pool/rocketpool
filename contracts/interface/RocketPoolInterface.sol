pragma solidity 0.4.24;


contract RocketPoolInterface {
    function getRandomAvailableMinipool(uint256 _nonce) public view returns (address);
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external returns (address);
    function minipoolRemove(address _minipool) public returns (bool);
    function minipoolRemoveCheck(address _sender, address _minipool) public returns (bool);
}
