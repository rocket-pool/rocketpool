pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

// Network token price data

contract RocketNetworkPrices is RocketBase, RocketNetworkPricesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event PricesSubmitted(address indexed from, uint256 block, uint256 rplPrice, uint256 effectiveRplStake, uint256 time);
    event PricesUpdated(uint256 block, uint256 rplPrice, uint256 effectiveRplStake, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Set contract version
        version = 1;
        // Set initial RPL price
        setRPLPrice(0.01 ether);
    }

    // The block number which prices are current for
    function getPricesBlock() override public view returns (uint256) {
        return getUint(keccak256("network.prices.updated.block"));
    }
    function setPricesBlock(uint256 _value) private {
        setUint(keccak256("network.prices.updated.block"), _value);
    }

    // The current RP network RPL price in ETH
    function getRPLPrice() override external view returns (uint256) {
        return getUint(keccak256("network.prices.rpl"));
    }
    function setRPLPrice(uint256 _value) private {
        setUint(keccak256("network.prices.rpl"), _value);
    }

    // The current RP network effective RPL stake
    function getEffectiveRPLStake() override external view returns (uint256) {
        return getUint(keccak256("network.rpl.stake"));
    }
    function getEffectiveRPLStakeUpdatedBlock() override public view returns (uint256) {
        return getUint(keccak256("network.rpl.stake.updated.block"));
    }
    function setEffectiveRPLStake(uint256 _value) private {
        setUint(keccak256("network.rpl.stake"), _value);
        setUint(keccak256("network.rpl.stake.updated.block"), block.number);
    }
    function increaseEffectiveRPLStake(uint256 _amount) override external onlyLatestNetworkContract {
        require(inConsensus(), "Network is not in consensus");
        addUint(keccak256("network.rpl.stake"), _amount);
        setUint(keccak256("network.rpl.stake.updated.block"), block.number);
    }
    function decreaseEffectiveRPLStake(uint256 _amount) override external onlyLatestNetworkContract {
        require(inConsensus(), "Network is not in consensus");
        subUint(keccak256("network.rpl.stake"), _amount);
        setUint(keccak256("network.rpl.stake.updated.block"), block.number);
    }

    // Submit network price data for a block
    // Only accepts calls from trusted (oracle) nodes
    function submitPrices(uint256 _block, uint256 _rplPrice, uint256 _effectiveRplStake) override external onlyLatestContract("rocketNetworkPrices", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.prices.submitted.node.key", msg.sender, _block, _rplPrice, _effectiveRplStake));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _rplPrice, _effectiveRplStake));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.prices.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit prices submitted event
        emit PricesSubmitted(msg.sender, _block, _rplPrice, _effectiveRplStake, block.timestamp);
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold()) {
            // Update the price
            updatePrices(_block, _rplPrice, _effectiveRplStake);
        }
    }

    // Executes updatePrices if consensus threshold is reached
    function executeUpdatePrices(uint256 _block, uint256 _rplPrice, uint256 _effectiveRplStake) override external onlyLatestContract("rocketNetworkPrices", address(this)) {
        // Check settings
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        require(rocketDAOProtocolSettingsNetwork.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block < block.number, "Prices can not be submitted for a future block");
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _rplPrice, _effectiveRplStake));
        // Get submission count
        uint256 submissionCount = getUint(submissionCountKey);
        // Check submission count & update network prices
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        require(calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketDAOProtocolSettingsNetwork.getNodeConsensusThreshold(), "Consensus has not been reached");
        // Update the price
        updatePrices(_block, _rplPrice, _effectiveRplStake);
    }

    // Update network price data
    function updatePrices(uint256 _block, uint256 _rplPrice, uint256 _effectiveRplStake) private {
        // Ensure effective stake hasn't been updated on chain since `_block`
        require(_block >= getEffectiveRPLStakeUpdatedBlock(), "Cannot update effective RPL stake based on block lower than when it was last updated on chain");
        // Update price and effective RPL stake
        setRPLPrice(_rplPrice);
        setPricesBlock(_block);
        setEffectiveRPLStake(_effectiveRplStake);
        // Emit prices updated event
        emit PricesUpdated(_block, _rplPrice, _effectiveRplStake, block.timestamp);
    }

    // Returns true if consensus has been reached for the last price reportable block
    function inConsensus() override public view returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Get the block prices were lasted updated and the update frequency
        uint256 pricesBlock = getPricesBlock();
        uint256 updateFrequency = rocketDAOProtocolSettingsNetwork.getSubmitPricesFrequency();
        // Calculate the last reportable block (we are still in consensus if this transaction is WITHIN the next reportable block, hence the subtract 1)
        uint256 latestReportableBlock = block.number.sub(1).div(updateFrequency).mul(updateFrequency);
        // If we've passed into a new window then we are waiting for oracles to report the next price
        return pricesBlock >= latestReportableBlock;
    }

    // Returns the latest block number that oracles should be reporting prices for
    function getLatestReportableBlock() override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        // Get the block prices were lasted updated and the update frequency
        uint256 pricesBlock = getPricesBlock();
        uint256 updateFrequency = rocketDAOProtocolSettingsNetwork.getSubmitPricesFrequency();
        // Calculate the last reportable block based on update frequency
        uint256 latestReportableBlock = block.number.div(updateFrequency).mul(updateFrequency);
        // There is an edge case where the update frequency is modified by the DAO and the latest reportable block calculated
        // via the above method is older than the most recent block the effective RPL stake was updated on chain. If we don't
        // handle that then price updates will fail for that block
        uint256 lastOnChainUpdate = getEffectiveRPLStakeUpdatedBlock();
        if (pricesBlock < latestReportableBlock && lastOnChainUpdate > latestReportableBlock) {
            return lastOnChainUpdate;
        }
        return latestReportableBlock;
    }
}
