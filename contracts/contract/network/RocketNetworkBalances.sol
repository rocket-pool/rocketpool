pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";

// Network balances

contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BalancesUpdated(uint256 block, uint256 totalEth, uint256 stakingEth, uint256 rethSupply, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // The block number which balances are current for
    function getBalancesBlock() override public view returns (uint256) {
        return getUintS("network.balances.updated.block");
    }
    function setBalancesBlock(uint256 _value) private {
        setUintS("network.balances.updated.block", _value);
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

    // Get the current RP network ETH utilization rate as a fraction of 1 ETH
    // Represents what % of the network's balance is actively earning rewards
    function getETHUtilizationRate() override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        uint256 totalEthBalance = getTotalETHBalance();
        uint256 stakingEthBalance = getStakingETHBalance();
        if (totalEthBalance == 0) { return calcBase; }
        return calcBase.mul(stakingEthBalance).div(totalEthBalance);
    }

    // Submit network balances for a block
    // Only accepts calls from trusted (oracle) nodes
    function submitBalances(uint256 _block, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketNetworkSettingsInterface rocketNetworkSettings = RocketNetworkSettingsInterface(getContractAddress("rocketNetworkSettings"));
        require(rocketNetworkSettings.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block > getBalancesBlock(), "Network balances for an equal or higher block are set");
        // Check balances
        require(_stakingEth <= _totalEth, "Invalid network balances");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block, _totalEth, _stakingEth, _rethSupply));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _totalEth, _stakingEth, _rethSupply));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Check submission count & update network balances
        uint256 calcBase = 1 ether;
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketNetworkSettings.getNodeConsensusThreshold()) {
            updateBalances(_block, _totalEth, _stakingEth, _rethSupply);
        }
    }

    // Update network balances
    function updateBalances(uint256 _block, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) private {
        // Update balances
        setBalancesBlock(_block);
        setTotalETHBalance(_totalEth);
        setStakingETHBalance(_stakingEth);
        setTotalRETHSupply(_rethSupply);
        // Emit balances updated event
        emit BalancesUpdated(_block, _totalEth, _stakingEth, _rethSupply, now);
    }

}
