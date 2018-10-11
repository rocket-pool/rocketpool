pragma solidity 0.4.24;


contract RocketPoolInterface {
    function getRandomAvailableMinipool(string _durationID, uint256 _nonce) public view returns (address);
    function getNetworkUtilisation() public view returns (uint256);
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external returns (address);
    function minipoolRemove(address _minipool) public returns (bool);
    function minipoolRemoveCheck(address _sender, address _minipool) public returns (bool);
    function minipoolSetAvailable(bool _available) external returns (bool);
    function getTotalEther(string _type) public view returns (uint256);
    function increaseTotalEther(string _type, uint256 _value) external;
    function decreaseTotalEther(string _type, uint256 _value) external;
}
