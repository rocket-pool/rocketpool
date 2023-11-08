// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketNodeStakingInterface {
    function getTotalRPLStake() external view returns (uint256);
    function getNodeRPLStake(address _nodeAddress) external view returns (uint256);
    function getNodeETHMatched(address _nodeAddress) external view returns (uint256);
    function getNodeETHProvided(address _nodeAddress) external view returns (uint256);
    function getNodeETHCollateralisationRatio(address _nodeAddress) external view returns (uint256);
    function getNodeRPLStakedTime(address _nodeAddress) external view returns (uint256);
    function getNodeEffectiveRPLStake(address _nodeAddress) external view returns (uint256);
    function getNodeMinimumRPLStake(address _nodeAddress) external view returns (uint256);
    function getNodeMaximumRPLStake(address _nodeAddress) external view returns (uint256);
    function getNodeETHMatchedLimit(address _nodeAddress) external view returns (uint256);
    function getRPLLockingAllowed(address _nodeAddress) external view returns (bool);
    function stakeRPL(uint256 _amount) external;
    function stakeRPLFor(address _nodeAddress, uint256 _amount) external;
    function setRPLLockingAllowed(address _nodeAddress, bool _allowed) external;
    function setStakeRPLForAllowed(address _caller, bool _allowed) external;
    function setStakeRPLForAllowed(address _nodeAddress, address _caller, bool _allowed) external;
    function getNodeRPLLocked(address _nodeAddress) external view returns (uint256);
    function lockRPL(address _nodeAddress, uint256 _amount) external;
    function unlockRPL(address _nodeAddress, uint256 _amount) external;
    function transferRPL(address _from, address _to, uint256 _amount) external;
    function withdrawRPL(uint256 _amount) external;
    function withdrawRPL(address _nodeAddress, uint256 _amount) external;
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) external;
}
