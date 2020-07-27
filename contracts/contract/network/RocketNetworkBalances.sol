pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";
import "../../lib/SafeMath.sol";

// Network ETH balances

contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BalancesUpdated(uint256 block, uint256 totalEth, uint256 stakingEth, uint256 rethSupply, uint256 time);

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

    // The current RP network total rETH supply
    function getTotalRETHSupply() override public view returns (uint256) {
        return getUintS("network.balance.reth.supply");
    }
    function setTotalRETHSupply(uint256 _value) private {
        setUintS("network.balance.reth.supply", _value);
    }

    // The block number which balances are current for
    function getETHBalancesBlock() override public view returns (uint256) {
        return getUintS("network.balances.updated.block");
    }
    function setETHBalancesBlock(uint256 _value) private {
        setUintS("network.balances.updated.block", _value);
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

    // Submit network ETH balances for a block
    // Only accepts calls from trusted (oracle) nodes
    function submitETHBalances(uint256 _block, uint256 _total, uint256 _staking, uint256 _rethSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketNetworkSettingsInterface rocketNetworkSettings = RocketNetworkSettingsInterface(getContractAddress("rocketNetworkSettings"));
        require(rocketNetworkSettings.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block > getETHBalancesBlock(), "Network balances for an equal or higher block are set");
        // Check balances
        require(_staking <= _total, "Invalid network balances");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block, _total, _staking, _rethSupply));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _total, _staking, _rethSupply));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & update network balances
        uint256 calcBase = 1 ether;
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (calcBase.mul(submissionCount).div(rocketNodeManager.getTrustedNodeCount()) >= rocketNetworkSettings.getNodeConsensusThreshold()) {
            updateETHBalances(_block, _total, _staking, _rethSupply);
        }
    }

    // Update network ETH balances
    function updateETHBalances(uint256 _block, uint256 _total, uint256 _staking, uint256 _rethSupply) private {
        // Update balances
        setETHBalancesBlock(_block);
        setTotalETHBalance(_total);
        setStakingETHBalance(_staking);
        setTotalRETHSupply(_rethSupply);
        // Emit balances updated event
        emit BalancesUpdated(_block, _total, _staking, _rethSupply, now);
    }

}
