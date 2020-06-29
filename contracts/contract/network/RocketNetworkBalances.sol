pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../lib/SafeMath.sol";

// Network ETH balances

contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BalancesUpdated(uint256 epoch, uint256 totalEth, uint256 stakingEth, uint256 time);

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

    // The epoch which balances are current for
    function getETHBalancesEpoch() override public view returns (uint256) {
        return getUintS("network.balances.updated.epoch");
    }
    function setETHBalancesEpoch(uint256 _value) private {
        setUintS("network.balances.updated.epoch", _value);
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

    // Increase total ETH balance
    // Only accepts calls from the RocketDepositPool contract
    function increaseTotalETHBalance(uint256 _amount) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) {
        setTotalETHBalance(getTotalETHBalance().add(_amount));
    }

    // Decrease total ETH balance
    // Only accepts calls from the RocketETHToken contract
    function decreaseTotalETHBalance(uint256 _amount) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyLatestContract("rocketETHToken", msg.sender) {
        setTotalETHBalance(getTotalETHBalance().sub(_amount));
    }

    // Submit network ETH balances for an epoch
    // Only accepts calls from trusted (oracle) nodes
    function submitETHBalances(uint256 _epoch, uint256 _total, uint256 _staking) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyTrustedNode(msg.sender) {
        // Check epoch
        require(_epoch > getETHBalancesEpoch(), "Network balances for an equal or higher epoch are set");
        // Check balances
        require(_staking <= _total, "Invalid network balances");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _epoch, _total, _staking));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _epoch, _total, _staking));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & update network balances
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (submissionCount.mul(2) >= rocketNodeManager.getTrustedNodeCount()) { updateETHBalances(_epoch, _total, _staking); }
    }

    // Update network ETH balances
    function updateETHBalances(uint256 _epoch, uint256 _total, uint256 _staking) private {
        // Update balances
        setETHBalancesEpoch(_epoch);
        setTotalETHBalance(_total);
        setStakingETHBalance(_staking);
        // Emit balances updated event
        emit BalancesUpdated(_epoch, _total, _staking, now);
    }

}
