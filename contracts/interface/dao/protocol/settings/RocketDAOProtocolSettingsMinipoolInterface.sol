pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../../../types/MinipoolDeposit.sol";

interface RocketDAOProtocolSettingsMinipoolInterface {
    function getLaunchBalance() external view returns (uint256);
    function getDepositNodeAmount(MinipoolDeposit _depositType) external view returns (uint256);
    function getFullDepositNodeAmount() external view returns (uint256);
    function getHalfDepositNodeAmount() external view returns (uint256);
    function getEmptyDepositNodeAmount() external view returns (uint256);
    function getDepositUserAmount(MinipoolDeposit _depositType) external view returns (uint256);
    function getFullDepositUserAmount() external view returns (uint256);
    function getHalfDepositUserAmount() external view returns (uint256);
    function getEmptyDepositUserAmount() external view returns (uint256);
    function getSubmitWithdrawableEnabled() external view returns (bool);
    function getLaunchTimeout() external view returns (uint256);
    function getScrubPeriod() external view returns (uint256);
    function getMaximumCount() external view returns (uint256);
}
