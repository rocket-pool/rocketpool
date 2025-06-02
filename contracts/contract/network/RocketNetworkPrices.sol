// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";

/// @notice Oracle contract for network token price data
contract RocketNetworkPrices is RocketBase, RocketNetworkPricesInterface {

    // Constants
    bytes32 immutable priceKey;
    bytes32 immutable blockKey;

    // Events
    event PricesSubmitted(address indexed from, uint256 block, uint256 slotTimestamp, uint256 rplPrice, uint256 time);
    event PricesUpdated(uint256 indexed block, uint256 slotTimestamp, uint256 rplPrice, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Set contract version
        version = 4;

        // Precompute keys
        priceKey = keccak256("network.prices.rpl");
        blockKey = keccak256("network.prices.updated.block");
    }

    /// @notice Returns the block number which prices are current for
    function getPricesBlock() override public view returns (uint256) {
        return getUint(blockKey);
    }

    /// @dev Sets the block number which prices are current for
    function setPricesBlock(uint256 _value) private {
        setUint(blockKey, _value);
    }

    /// @notice Returns the current network RPL price in ETH
    function getRPLPrice() override public view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        uint256 price = uint256(rocketNetworkSnapshots.latestValue(priceKey));
        if (price == 0) {
            price = getUint(priceKey);
        }
        return price;
    }

    /// @dev Sets the current network RPL price in ETH
    function setRPLPrice(uint256 _value) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        rocketNetworkSnapshots.push(priceKey, uint224(_value));
    }

    /// @notice Submit network price data for a block
    ///         Only accepts calls from trusted (oracle) nodes
    /// @param _block The block this price submission is for
    /// @param _slotTimestamp timestamp for the slot the balance should be updated, which is used to find the latest valid EL block
    /// @param _rplPrice The price of RPL at the given block
    function submitPrices(uint256 _block, uint256 _slotTimestamp, uint256 _rplPrice) override external onlyLatestContract("rocketNetworkPrices", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        uint256 lastPricesBlock = getPricesBlock();
        require(_block >= lastPricesBlock, "Network prices for a higher block are set");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.prices.submitted.node.key", msg.sender, _block, _slotTimestamp, _rplPrice));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _slotTimestamp, _rplPrice));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.prices.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey) + 1;
        setUint(submissionCountKey, submissionCount);
        // Emit prices submitted event
        emit PricesSubmitted(msg.sender, _block, _slotTimestamp, _rplPrice, block.timestamp);
        // If voting past consensus, return
        if (_block == lastPricesBlock) {
            return;
        }
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if ((calcBase * submissionCount) / rocketDAONodeTrusted.getMemberCount() >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            // Update the price
            updatePrices(_block, _slotTimestamp, _rplPrice);
        }
    }

    /// @notice Executes updatePrices if consensus threshold is reached
    /// @param _block The block to execute price update for
    /// @param _slotTimestamp timestamp for the slot the balance should be updated, which is used to find the latest valid EL block
    /// @param _rplPrice The price of RPL at the given block
    function executeUpdatePrices(uint256 _block, uint256 _slotTimestamp, uint256 _rplPrice) override external onlyLatestContract("rocketNetworkPrices", address(this)) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _slotTimestamp, _rplPrice));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require((calcBase * submissionCount) / rocketDAONodeTrusted.getMemberCount() >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        // Update the price
        updatePrices(_block, _slotTimestamp, _rplPrice);
    }

    /// @dev Update network price data
    /// @param _block The block to update price for
    /// @param _rplPrice The price of RPL at the given block
    function updatePrices(uint256 _block, uint256 _slotTimestamp, uint256 _rplPrice) private {
        // Update price
        setRPLPrice(_rplPrice);
        setPricesBlock(_block);
        // Emit prices updated event
        emit PricesUpdated(_block, _slotTimestamp, _rplPrice, block.timestamp);
    }
}
