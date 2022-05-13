pragma solidity 0.7.6;
pragma abicoder v2;

import "../../types/RewardSubmission.sol";

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getRewardIndex() external view returns(uint256);
    function getRPLBalance() external view returns(uint256);
    function getPendingRPLRewards() external view returns (uint256);
    function getPendingETHRewards() external view returns (uint256);
    function getClaimIntervalTimeStart() external view returns(uint256);
    function getClaimIntervalTime() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimingContractPerc(string memory _claimingContract) external view returns(uint256);
    function getTrustedNodeSubmitted(address _trustedNodeAddress, uint256 _rewardIndex) external view returns (bool);
    function getSubmissionCount(RewardSubmission calldata _submission) external view returns (uint256);
    function submitRewardSnapshot(RewardSubmission calldata _submission) external;
    function executeRewardSnapshot(RewardSubmission calldata _submission) external;
}
