pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketMinipoolManagerInterface {
    function createMinipool(address _nodeAddress, MinipoolDeposit _depositType) external returns (address);
    function destroyMinipool() external;
}
