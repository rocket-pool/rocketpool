// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../interface/RocketStorageInterface.sol";

interface RocketMegapoolDelegateBaseInterface {
    function deprecate() external;
    function getExpirationBlock() external view returns (uint256);
}
