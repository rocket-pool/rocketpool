pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedActionsInterface {
    function actionJoin() external;
    function actionLeave(address _rplBondRefundAddress) external;
    function actionReplace() external; 
    function actionKick(address _nodeAddress) external;
}
