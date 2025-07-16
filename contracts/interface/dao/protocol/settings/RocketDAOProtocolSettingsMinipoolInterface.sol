pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "../../../../types/MinipoolDeposit.sol";

interface RocketDAOProtocolSettingsMinipoolInterface {
    function getLaunchBalance() external view returns (uint256);
    function getPreLaunchValue() external pure returns (uint256);
    function getDepositUserAmount(MinipoolDeposit _depositType) external view returns (uint256);
    function getFullDepositUserAmount() external view returns (uint256);
    function getHalfDepositUserAmount() external view returns (uint256);
    function getVariableDepositAmount() external view returns (uint256);
    function getSubmitWithdrawableEnabled() external view returns (bool);
    function getBondReductionEnabled() external view returns (bool);
    function getLaunchTimeout() external view returns (uint256);
    function getMaximumCount() external view returns (uint256);
    function isWithinUserDistributeWindow(uint256 _time) external view returns (bool);
    function hasUserDistributeWindowPassed(uint256 _time) external view returns (bool);
    function getUserDistributeWindowStart() external view returns (uint256);
    function getUserDistributeWindowLength() external view returns (uint256);
    function getMaximumPenaltyCount() external view returns (uint256);
}
