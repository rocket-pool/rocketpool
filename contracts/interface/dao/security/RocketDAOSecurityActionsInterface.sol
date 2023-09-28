pragma solidity >0.5.0 <0.9.0;
// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOSecurityActionsInterface {
    function actionKick(address _nodeAddress) external;
    function actionJoin() external;
    function actionRequestLeave() external;
    function actionLeave() external;
}
