pragma solidity 0.5.8;


contract RocketPoolInterface {
    function getRandomAvailableMinipool(bool _trusted, string memory _durationID, uint256 _seed, uint256 _offset) public returns (address);
    function getNetworkUtilisation(string memory _durationID) public view returns (uint256);
    function getPoolsCount() public returns(uint256);
    function getAvailableNodePoolsCount(address _nodeAddress, bool _trusted, string memory _durationID) public returns(uint256);
    function getTotalEther(string memory _type, string memory _durationID) public view returns (uint256);
    function minipoolCreate(address _nodeOwner, string memory _durationID, bytes memory _depositInput, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) public returns (address);
    function minipoolRemove() public returns (bool);
}
