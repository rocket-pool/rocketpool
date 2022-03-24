pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedActionsInterface {
    function actionJoin() external;
    function actionJoinRequired(address _nodeAddress) external;
    function actionLeave(address _ggpBondRefundAddress) external;
    function actionKick(address _nodeAddress, uint256 _ggpFine) external;
    function actionChallengeMake(address _nodeAddress) external payable;
    function actionChallengeDecide(address _nodeAddress) external;
}
