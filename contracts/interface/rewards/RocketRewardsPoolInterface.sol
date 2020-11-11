pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getClaimIntervalBlockStart() external view returns(uint256);
    function getClaimIntervalBlocks() external view returns(uint256);
    function getClaimBlockLastMade() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimIntervalRewardsTotal() external view returns(uint256);
    function getClaimIntervalContractTotalRewards(address _claimingContract) external view returns(uint256);
    function getClaimIntervalContractPerc(address _claimingContract) external view returns(uint256);
    function getClaimIntervalContractTotalClaimed(address _claimingContract) external view returns(uint256);
    function getClaimedBefore(address _claimingContract, address _claimerAddress) external view returns(bool);
    function getClaimIntervalHasClaimed(uint256 _claimIntervalStartBlock, address _claimingContract, address _claimerAddress) external view returns(bool);
    function getClaimAmount(address _claimContract, address _claimerAddress, uint256 _claimerAmountPerc) external view returns (uint256);
    function claim(address _claimerAddress, uint256 _claimerAmount) external;
}
