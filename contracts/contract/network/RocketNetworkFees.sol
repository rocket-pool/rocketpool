// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Network node demand and commission rate
contract RocketNetworkFees is RocketBase, RocketNetworkFeesInterface {

    // Libs
    using SafeMath for uint;
    using SafeCast for uint;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Returns the current RP network node demand in ETH
    ///         Node demand is equal to deposit pool balance minus available minipool capacity
    function getNodeDemand() override public view returns (int256) {
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        // Calculate & return
        int256 depositPoolBalance = rocketDepositPool.getBalance().toInt256();
        int256 minipoolCapacity = rocketMinipoolQueue.getEffectiveCapacity().toInt256();
        int256 demand = depositPoolBalance - minipoolCapacity;
        require(demand <= depositPoolBalance);
        return demand;
    }

    /// @notice Returns the current RP network node fee as a fraction of 1 ETH
    function getNodeFee() override external view returns (uint256) {
        return getNodeFeeByDemand(getNodeDemand());
    }

    /// @notice Returns the network node fee for a given node demand value
    /// @param _nodeDemand The node demand to calculate the fee for
    function getNodeFeeByDemand(int256 _nodeDemand) override public view returns (uint256) {
        // Calculation base values
        uint256 demandDivisor = 1000000000000;
        // Get settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        uint256 minFee = rocketDAOProtocolSettingsNetwork.getMinimumNodeFee();
        uint256 targetFee = rocketDAOProtocolSettingsNetwork.getTargetNodeFee();
        uint256 maxFee = rocketDAOProtocolSettingsNetwork.getMaximumNodeFee();
        uint256 demandRange = rocketDAOProtocolSettingsNetwork.getNodeFeeDemandRange();
        // Normalize node demand
        uint256 nNodeDemand;
        bool nNodeDemandSign;
        if (_nodeDemand < 0) {
            nNodeDemand = uint256(-_nodeDemand);
            nNodeDemandSign = false;
        } else {
            nNodeDemand = uint256(_nodeDemand);
            nNodeDemandSign = true;
        }
        nNodeDemand = nNodeDemand.mul(calcBase).div(demandRange);
        // Check range bounds
        if (nNodeDemand == 0) { return targetFee; }
        if (nNodeDemand >= calcBase) {
            if (nNodeDemandSign) { return maxFee; }
            return minFee;
        }
        // Get fee interpolation factor
        uint256 t = nNodeDemand.div(demandDivisor) ** 3;
        // Interpolate between min / target / max fee
        if (nNodeDemandSign) { return targetFee.add(maxFee.sub(targetFee).mul(t).div(calcBase)); }
        return minFee.add(targetFee.sub(minFee).mul(calcBase.sub(t)).div(calcBase));
    }

}
