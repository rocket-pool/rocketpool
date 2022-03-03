pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getRewardIndex() external view returns(uint256);
    function getRPLBalance() external view returns(uint256);
    function getPendingRewards() external view returns (uint256);
    function getClaimIntervalTimeStart() external view returns(uint256);
    function getClaimIntervalTime() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimingContractPerc(string memory _claimingContract) external view returns(uint256);
    function submitRewardSnapshot(uint256 _index, uint256 _totalRewards, uint256[] memory _rewardsPerNetwork, bytes32 _merkleRoot, string calldata _merkleTreeCID) external;
    function executeRewardSnapshot(uint256 _index, uint256 _totalRewards, uint256[] memory _rewardsPerNetwork, bytes32 _merkleRoot, string calldata _merkleTreeCID) external;
}
