// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {RocketMegapoolDelegateInterface} from "./RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolProxyInterface} from "./RocketMegapoolProxyInterface.sol";

interface RocketMegapoolInterface is RocketMegapoolDelegateInterface, RocketMegapoolProxyInterface {
    function version() external view returns (uint256);
}