pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../lib/SafeMath.sol";

// Network ETH balances

contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // The current RP network total ETH balance
    function getTotalETHBalance() override public view returns (uint256) {
        return getUintS("network.balance.total");
    }
    function setTotalETHBalance(uint256 _value) private {
        setUintS("network.balance.total", _value);
    }

    // The current RP network staking ETH balance
    function getStakingETHBalance() override public view returns (uint256) {
        return getUintS("network.balance.staking");
    }
    function setStakingETHBalance(uint256 _value) private {
        setUintS("network.balance.staking", _value);
    }

    // Update network ETH balances
    // Only accepts calls from trusted (oracle) nodes
    function updateETHBalances(uint256 _epoch, uint256 _total, uint256 _staking) external onlyTrustedNode(msg.sender) {
        setTotalETHBalance(_total);
        setStakingETHBalance(_staking);
    }

    // Increase total ETH balance
    // Only accepts calls from the RocketDepositPool contract
    function increaseTotalETHBalance(uint256 _amount) override external onlyLatestContract("rocketDepositPool", msg.sender) {
        setTotalETHBalance(getTotalETHBalance().add(_amount));
    }

    // Decrease total ETH balance
    // Only accepts calls from the RocketETHToken contract
    function decreaseTotalETHBalance(uint256 _amount) override external onlyLatestContract("rocketETHToken", msg.sender) {
        setTotalETHBalance(getTotalETHBalance().sub(_amount));
    }

    // Get the current RP network ETH utilization rate as a fraction of 1 ETH
    // Represents what % of the network's balance is actively earning rewards
    function getETHUtilizationRate() override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        uint256 totalEthBalance = getTotalETHBalance();
        uint256 stakingEthBalance = getStakingETHBalance();
        if (totalEthBalance == 0) { return calcBase; }
        return calcBase.mul(stakingEthBalance).div(totalEthBalance);
    }

}
