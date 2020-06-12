pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../lib/SafeMath.sol";

// Network node demand and commission rate

contract RocketNetworkFees is RocketBase, RocketNetworkFeesInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the current RP network node demand in ETH
    // Node demand is equal to deposit pool balance minus available minipool capacity
    function getNodeDemand() override public view returns (int256) {
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        // Calculate & return
        return int256(rocketDepositPool.getBalance()) - int256(rocketMinipoolQueue.getEffectiveCapacity());
    }

    // Get the current RP network node fee as a fraction of 1 ETH
    function getNodeFee() override public view returns (uint256) {
        // TODO: implement
        return 0.1 ether;
    }

}
