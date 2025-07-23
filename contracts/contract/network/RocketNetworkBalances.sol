// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Oracle contract for network balance data
contract RocketNetworkBalances is RocketBase, RocketNetworkBalancesInterface {
    // Events
    event BalancesSubmitted(address indexed from, uint256 block, uint256 slotTimestamp, uint256 totalEth, uint256 stakingEth, uint256 rethSupply, uint256 blockTimestamp);
    event BalancesUpdated(uint256 indexed block, uint256 slotTimestamp, uint256 totalEth, uint256 stakingEth, uint256 rethSupply, uint256 blockTimestamp);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 4;
    }

    /// @notice The block number which balances are current for
    function getBalancesBlock() override public view returns (uint256) {
        return getUint(keccak256("network.balances.updated.block"));
    }

    /// @notice Sets the block number which balances are current for
    function setBalancesBlock(uint256 _value) private {
        setUint(keccak256("network.balances.updated.block"), _value);
    }

    /// @notice Get the timestamp for the last balance update
    function getBalancesTimestamp() override public view returns (uint256) {
        return getUint(keccak256("network.balances.updated.timestamp"));
    }

    /// @notice Sets the timestamp of the last balance update
    function setBalancesTimestamp(uint256 _value) private {
        setUint(keccak256("network.balances.updated.timestamp"), _value);
    }

    /// @notice The current RP network total ETH balance
    function getTotalETHBalance() override public view returns (uint256) {
        return getUint(keccak256("network.balance.total"));
    }

    /// @notice Sets the current RP network total ETH balance
    function setTotalETHBalance(uint256 _value) private {
        setUint(keccak256("network.balance.total"), _value);
    }

    /// @notice The current RP network staking ETH balance
    function getStakingETHBalance() override public view returns (uint256) {
        return getUint(keccak256("network.balance.staking"));
    }

    /// @notice Sets the current RP network staking ETH balance
    function setStakingETHBalance(uint256 _value) private {
        setUint(keccak256("network.balance.staking"), _value);
    }

    /// @notice The current RP network total rETH supply
    function getTotalRETHSupply() override public view returns (uint256) {
        return getUint(keccak256("network.balance.reth.supply"));
    }

    /// @notice Sets the current RP network total rETH supply
    function setTotalRETHSupply(uint256 _value) private {
        setUint(keccak256("network.balance.reth.supply"), _value);
    }

    /// @notice Get the current RP network ETH utilization rate as a fraction of 1 ETH
    ///         Represents what % of the network's balance is actively earning rewards
    function getETHUtilizationRate() override external view returns (uint256) {
        uint256 totalEthBalance = getTotalETHBalance();
        uint256 stakingEthBalance = getStakingETHBalance();
        if (totalEthBalance == 0) { return calcBase; }
        return calcBase * stakingEthBalance / totalEthBalance;
    }

    /// @notice Submit network balances for a block.
    ///         Only accepts calls from trusted (oracle) nodes.
    function submitBalances(uint256 _block, uint256 _slotTimestamp, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block < block.number, "Balances can not be submitted for a future block");
        uint256 lastBalancesBlock = getBalancesBlock();
        require(_block >= lastBalancesBlock, "Network balances for a higher block are set");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.balances.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey) + 1;
        setUint(submissionCountKey, submissionCount);
        // Emit balances submitted event
        emit BalancesSubmitted(msg.sender, _block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply, block.timestamp);
        // If voting past consensus, return
        if (_block == lastBalancesBlock) {
            return;
        }
        // Check submission count & update network balances
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase * submissionCount / rocketDAONodeTrusted.getMemberCount() >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            updateBalances(_block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply);
        }
    }

    /// @notice Executes updateBalances if consensus threshold is reached
    function executeUpdateBalances(uint256 _block, uint256 _slotTimestamp, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) override external onlyLatestContract("rocketNetworkBalances", address(this)) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitBalancesEnabled(), "Submitting balances is currently disabled");
        // Check block
        require(_block < block.number, "Balances can not be submitted for a future block");
        require(_block > getBalancesBlock(), "Network balances for an equal or higher block are set");
        // Check balances
        require(_stakingEth <= _totalEth, "Invalid network balances");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.balances.submitted.count", _block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & update network balances
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require(calcBase * submissionCount / rocketDAONodeTrusted.getMemberCount() >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        updateBalances(_block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply);
    }

    /// @dev Internal method to update network balances
    function updateBalances(uint256 _block, uint256 _slotTimestamp, uint256 _totalEth, uint256 _stakingEth, uint256 _rethSupply) private {
        // Check enough time has passed (RPIP-61)
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        uint256 frequency = rocketDAOProtocolSettingsNetwork.getSubmitBalancesFrequency();
        uint256 lastTimestamp = getBalancesTimestamp();
        uint256 minimumTimestamp = lastTimestamp + (frequency * 95 / 100);
        require(block.timestamp >= minimumTimestamp, "Not enough time has passed");
        setBalancesTimestamp(block.timestamp);
        // Check rETH delta is within allowed range (RPIP-61)
        uint256 currentTotalEthBalance = getTotalETHBalance();
        // Bypass the delta restriction on first balance update
        if (currentTotalEthBalance > 0) {
            uint256 currentRethSupply = getTotalRETHSupply();
            uint256 currentRatio = calcBase * currentTotalEthBalance / currentRethSupply;
            uint256 newRatio = calcBase * _totalEth / _rethSupply;
            uint256 maxChangePercent = rocketDAOProtocolSettingsNetwork.getMaxRethDelta();
            uint256 maxChange = currentRatio * maxChangePercent / calcBase;
            // Limit change per RPIP-61
            if (newRatio > currentRatio) {
                require(newRatio - currentRatio <= maxChange, "Change exceeds maximum");
            } else {
                require(currentRatio - newRatio <= maxChange, "Change exceeds maximum");
            }
        }
        // Update balances
        setBalancesBlock(_block);
        setTotalETHBalance(_totalEth);
        setStakingETHBalance(_stakingEth);
        setTotalRETHSupply(_rethSupply);
        // Emit balances updated event
        emit BalancesUpdated(_block, _slotTimestamp, _totalEth, _stakingEth, _rethSupply, block.timestamp);
    }
}
