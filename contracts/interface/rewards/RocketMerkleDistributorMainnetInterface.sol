// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "./RocketRewardsRelayInterface.sol";

interface RocketMerkleDistributorMainnetInterface is RocketRewardsRelayInterface {
    function initialise() external;
    function claimOutstandingEth() external;
    function getOutstandingEth(address _address) external view returns (uint256);
}
