// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketDAOProtocolSettingsMegapoolInterface {
    function initialise() external;
    function getTimeBeforeDissolve() external view returns (uint256);
    function getMaximumEthPenalty() external view returns (uint256);
    function getNotifyThreshold() external view returns (uint256);
    function getLateNotifyFine() external view returns (uint256);
    function getUserDistributeWindowLength() external view returns (uint256);
}
