pragma solidity 0.4.24;


contract RocketPoolInterface {
    function getRandomAvailableMinipool(string _durationID, uint256 _nonce) public view returns (address);
    function getNetworkUtilisation(string _durationID) public view returns (uint256);
    function getPoolsCount() public returns(uint256);
    function getTotalEther(string _type, string _durationID) public view returns (uint256);
    function setMinipoolAvailable(bool _available) external;
    function setNetworkIncreaseTotalEther(string _type, string _durationID, uint256 _value) external;
    function setworkDecreaseTotalEther(string _type, string _durationID, uint256 _value) external;
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external returns (address);
    function minipoolRemove(address _minipool) public returns (bool);
    function minipoolRemoveCheck(address _sender, address _minipool) public returns (bool);
}
