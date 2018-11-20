pragma solidity 0.5.0;


contract RocketPoolInterface {
    function getRandomAvailableMinipool(string memory _durationID, uint256 _nonce) public view returns (address);
    function getNetworkUtilisation(string memory _durationID) public view returns (uint256);
    function getPoolsCount() public returns(uint256);
    function getTotalEther(string memory _type, string memory _durationID) public view returns (uint256);
    function setMinipoolAvailable(bool _available) external;
    function setNetworkIncreaseTotalEther(string calldata _type, string calldata _durationID, uint256 _value) external;
    function setNetworkDecreaseTotalEther(string calldata _type, string calldata _durationID, uint256 _value) external;
    function minipoolCreate(address _nodeOwner, string calldata _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external returns (address);
    function minipoolRemove() public returns (bool);
}
