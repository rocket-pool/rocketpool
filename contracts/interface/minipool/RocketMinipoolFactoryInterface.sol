pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketMinipoolFactoryInterface {
    function createMinipool(address _nodeAddress, MinipoolDeposit _depositType) external returns (address);
}
