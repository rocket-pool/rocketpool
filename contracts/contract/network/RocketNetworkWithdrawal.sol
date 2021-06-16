pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";

// Handles network validator withdrawals

contract RocketNetworkWithdrawal is RocketBase, RocketNetworkWithdrawalInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event WithdrawalProcessed(bytes32 indexed validator, address indexed minipool, uint256 ethAmount, uint256 rethAmount, bool finalWithdraw, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Process a validator withdrawal from the beacon chain
    // Only accepts calls from registered minipools
    function processWithdrawal(address _nodeWithdrawalAddress, bool _finalWithdraw) override external payable onlyLatestContract("rocketNetworkWithdrawal", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketTokenRETHInterface rocketTokenRETH = RocketTokenRETHInterface(getContractAddress("rocketTokenRETH"));
        // Check network settings
        require(rocketDAOProtocolSettingsNetwork.getProcessWithdrawalsEnabled(), "Processing withdrawals is currently disabled");
        // Check minipool withdrawal status
        require(rocketMinipoolManager.getMinipoolWithdrawable(msg.sender), "Minipool is not withdrawable");
        if (_finalWithdraw) {
            // Can only process withdrawal once (shouldn't happen anyway as the minipool is destroyed)
            require(!rocketMinipoolManager.getMinipoolWithdrawalProcessed(msg.sender), "Withdrawal has already been processed for minipool");
            // Set withdrawal processed status
            rocketMinipoolManager.setMinipoolWithdrawalProcessed(msg.sender);
        }
        // Get withdrawal shares
        uint256 totalShare = rocketMinipoolManager.getMinipoolWithdrawalTotalBalance(msg.sender);
        // Get withdrawal amounts based on shares
        uint256 nodeAmount = 0;
        uint256 userAmount = 0;
        if (totalShare > 0) {
            // Calculate node and user proportionate shares
            uint256 nodeShare = rocketMinipoolManager.getMinipoolWithdrawalNodeBalance(msg.sender);
            nodeAmount = msg.value.mul(nodeShare).div(totalShare);
            userAmount = msg.value.sub(nodeAmount);

            // Transfer node ETH balance to node operator
            if (nodeAmount > 0) {
                // Send the node operator their share
                RocketMinipoolInterface rocketMinipool = RocketMinipoolInterface(msg.sender);
                rocketMinipool.payNode{value: nodeAmount}();
            }
            // Transfer user balance to rETH contract or deposit pool
            if (userAmount > 0) {
                if (rocketTokenRETH.getCollateralRate() < rocketDAOProtocolSettingsNetwork.getTargetRethCollateralRate()) {
                    rocketTokenRETH.depositRewards{value: userAmount}();
                } else {
                    rocketDepositPool.recycleWithdrawnDeposit{value: userAmount}();
                }
            }
        }
        // Emit withdrawal processed event
        emit WithdrawalProcessed(keccak256(abi.encodePacked(rocketMinipoolManager.getMinipoolPubkey(msg.sender))), msg.sender, nodeAmount, userAmount, _finalWithdraw, block.timestamp);
    }

}
