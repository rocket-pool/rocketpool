// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Oracle contract for network token price data
contract RocketNetworkPrices is RocketBase, RocketNetworkPricesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event PricesSubmitted(address indexed from, uint256 block, uint256 rplPrice, uint256 time);
    event PricesUpdated(uint256 block, uint256 rplPrice, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Set contract version
        version = 2;

        // On initial deploy, preset RPL price to 0.01
        if (getRPLPrice() == 0) {
            setRPLPrice(0.01 ether);
        }
    }

    /// @notice Returns the block number which prices are current for
    function getPricesBlock() override public view returns (uint256) {
        return getUint(keccak256("network.prices.updated.block"));
    }

    /// @dev Sets the block number which prices are current for
    function setPricesBlock(uint256 _value) private {
        setUint(keccak256("network.prices.updated.block"), _value);
    }

    /// @notice Returns the current network RPL price in ETH
    function getRPLPrice() override public view returns (uint256) {
        return getUint(keccak256("network.prices.rpl"));
    }

    /// @dev Sets the current network RPL price in ETH
    function setRPLPrice(uint256 _value) private {
        setUint(keccak256("network.prices.rpl"), _value);
    }

    /// @notice Submit network price data for a block
    ///         Only accepts calls from trusted (oracle) nodes
    /// @param _block The block this price submission is for
    /// @param _rplPrice The price of RPL at the given block
    function submitPrices(uint256 _block, uint256 _rplPrice) override external onlyLatestContract("rocketNetworkPrices", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.prices.submitted.node.key", msg.sender, _block, _rplPrice));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _rplPrice));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.prices.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit prices submitted event
        emit PricesSubmitted(msg.sender, _block, _rplPrice, block.timestamp);
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            // Update the price
            updatePrices(_block, _rplPrice);
        }
    }

    /// @notice Executes updatePrices if consensus threshold is reached
    /// @param _block The block to execute price update for
    /// @param _rplPrice The price of RPL at the given block
    function executeUpdatePrices(uint256 _block, uint256 _rplPrice) override external onlyLatestContract("rocketNetworkPrices", address(this)) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _rplPrice));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require(calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        // Update the price
        updatePrices(_block, _rplPrice);
    }

    /// @dev Update network price data
    /// @param _block The block to update price for
    /// @param _rplPrice The price of RPL at the given block
    function updatePrices(uint256 _block, uint256 _rplPrice) private {
        // Update price
        setRPLPrice(_rplPrice);
        setPricesBlock(_block);
        // Emit prices updated event
        emit PricesUpdated(_block, _rplPrice, block.timestamp);
    }

    /// @notice Returns the latest block number that oracles should be reporting prices for
    function getLatestReportableBlock() override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Get the block prices were lasted updated and the update frequency
        uint256 updateFrequency = rocketDAOProtocolSettingsNetwork.getSubmitPricesFrequency();
        // Calculate the last reportable block based on update frequency
        return block.number.div(updateFrequency).mul(updateFrequency);
    }
}
