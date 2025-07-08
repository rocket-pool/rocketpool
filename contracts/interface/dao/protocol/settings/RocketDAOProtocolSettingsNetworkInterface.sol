pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsNetworkInterface {
    function getNodeConsensusThreshold() external view returns (uint256);
    function getNodePenaltyThreshold() external view returns (uint256);
    function getPerPenaltyRate() external view returns (uint256);
    function getSubmitBalancesEnabled() external view returns (bool);
    function getSubmitBalancesFrequency() external view returns (uint256);
    function getSubmitPricesEnabled() external view returns (bool);
    function getSubmitPricesFrequency() external view returns (uint256);
    function getMinimumNodeFee() external view returns (uint256);
    function getTargetNodeFee() external view returns (uint256);
    function getMaximumNodeFee() external view returns (uint256);
    function getNodeFeeDemandRange() external view returns (uint256);
    function getTargetRethCollateralRate() external view returns (uint256);
    function getRethDepositDelay() external view returns (uint256);
    function getSubmitRewardsEnabled() external view returns (bool);
    function getMaxNodeShareSecurityCouncilAdder() external view returns (uint256);
    function getVoterShare() external view returns (uint256);
    function getProtocolDAOShare() external view returns (uint256);
    function getNodeShare() external view returns (uint256);
    function getNodeShareSecurityCouncilAdder() external view returns (uint256);
    function getRethCommission() external view returns (uint256);
    function getEffectiveVoterShare() external view returns (uint256);
    function getEffectiveNodeShare() external view returns (uint256);
    function getAllowListedControllers() external view returns (address[] memory);
    function getMaxRethDelta() external view returns (uint256);
    function isAllowListedController(address _address) external view returns (bool);
    function setNodeShareSecurityCouncilAdder(uint256 _value) external;
    function setNodeCommissionShare(uint256 _value) external;
    function setVoterShare(uint256 _value) external;
    function setProtocolDAOShare(uint256 _value) external;
}
