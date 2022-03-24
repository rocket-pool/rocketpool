pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

// Network balances

contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event BalancesSubmitted(address indexed from, uint256 block, uint256 totalEth, uint256 stakingEth, uint256 ggpavaxSupply, uint256 time);
    event BalancesUpdated(uint256 block, uint256 totalEth, uint256 stakingEth, uint256 ggpavaxSupply, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // The block number which balances are current for
    function getBalancesBlock() override public view returns (uint256) {
        return getUint(keccak256("network.balances.updated.block"));
    }
    function setBalancesBlock(uint256 _value) private {
        setUint(keccak256("network.balances.updated.block"), _value);
    }

    // The current RP network total ETH balance
    function getTotalETHBalance() override public view returns (uint256) {
        return getUint(keccak256("network.balance.total"));
    }
    function setTotalETHBalance(uint256 _value) private {
        setUint(keccak256("network.balance.total"), _value);
    }

    // The current RP network staking ETH balance
    function getStakingETHBalance() override public view returns (uint256) {
        return getUint(keccak256("network.balance.staking"));
    }
    function setStakingETHBalance(uint256 _value) private {
        setUint(keccak256("network.balance.staking"), _value);
    }

    // The current RP network total ggpAVAX supply
    function getTotalRETHSupply() override external view returns (uint256) {
        return getUint(keccak256("network.balance.ggpavax.supply"));
    }
    function setTotalRETHSupply(uint256 _value) private {
        setUint(keccak256("network.balance.ggpavax.supply"), _value);
    }

    // Get the current RP network ETH utilization rate as a fraction of 1 ETH
    // Represents what % of the network's balance is actively earning rewards
    function getETHUtilizationRate() override external view returns (uint256) {
        uint256 totalEthBalance = getTotalETHBalance();
        uint256 stakingEthBalance = getStakingETHBalance();
        if (totalEthBalance == 0) { return calcBase; }
        return calcBase.mul(stakingEthBalance).div(totalEthBalance);
    }

    // Submit network balances for a block
    // Only accepts calls from trusted (oracle) nodes
    function submitBalances(uint256 _block, uint256 _totalEth, uint256 _stakingEth, uint256 _ggpavaxSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block < block.number, "Balances can not be submitted for a future block");
        require(_block > getBalancesBlock(), "Network balances for an equal or higher block are set");
        // Check balances
        require(_stakingEth <= _totalEth, "Invalid network balances");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block, _totalEth, _stakingEth, _ggpavaxSupply));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _totalEth, _stakingEth, _ggpavaxSupply));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit balances submitted event
        emit BalancesSubmitted(msg.sender, _block, _totalEth, _stakingEth, _ggpavaxSupply, block.timestamp);
        // Check submission count & update network balances
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            updateBalances(_block, _totalEth, _stakingEth, _ggpavaxSupply);
        }
    }

    // Executes updateBalances if consensus threshold is reached
    function executeUpdateBalances(uint256 _block, uint256 _totalEth, uint256 _stakingEth, uint256 _ggpavaxSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block < block.number, "Balances can not be submitted for a future block");
        require(_block > getBalancesBlock(), "Network balances for an equal or higher block are set");
        // Check balances
        require(_stakingEth <= _totalEth, "Invalid network balances");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _totalEth, _stakingEth, _ggpavaxSupply));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & update network balances
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require(calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        updateBalances(_block, _totalEth, _stakingEth, _ggpavaxSupply);
    }

    // Update network balances
    function updateBalances(uint256 _block, uint256 _totalEth, uint256 _stakingEth, uint256 _ggpavaxSupply) private {
        // Update balances
        setBalancesBlock(_block);
        setTotalETHBalance(_totalEth);
        setStakingETHBalance(_stakingEth);
        setTotalRETHSupply(_ggpavaxSupply);
        // Emit balances updated event
        emit BalancesUpdated(_block, _totalEth, _stakingEth, _ggpavaxSupply, block.timestamp);
    }

    // Returns the latest block number that oracles should be reporting balances for
    function getLatestReportableBlock() override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Get the block balances were lasted updated and the update frequency
        uint256 updateFrequency = rocketDAOProtocolSettingsNetwork.getSubmitBalancesFrequency();
        // Calculate the last reportable block based on update frequency
        return block.number.div(updateFrequency).mul(updateFrequency);
    }
}
