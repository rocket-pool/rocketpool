pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";

// Network token price data

contract RocketNetworkPrices is RocketBase, RocketNetworkPricesInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event PricesSubmitted(address indexed from, uint256 block, uint256 rplPrice, uint256 time);
    event PricesUpdated(uint256 block, uint256 rplPrice, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set contract version
        version = 1;
        // Set initial RPL price
        setRPLPrice(0.01 ether);
    }

    // The block number which prices are current for
    function getPricesBlock() override public view returns (uint256) {
        return getUintS("network.prices.updated.block");
    }
    function setPricesBlock(uint256 _value) private {
        setUintS("network.prices.updated.block", _value);
    }

    // The current RP network RPL price in ETH
    function getRPLPrice() override public view returns (uint256) {
        return getUintS("network.price.rpl");
    }
    function setRPLPrice(uint256 _value) private {
        setUintS("network.price.rpl", _value);
    }

    // Submit network price data for a block
    // Only accepts calls from trusted (oracle) nodes
    function submitPrices(uint256 _block, uint256 _rplPrice) override external onlyLatestContract("rocketNetworkPrices", address(this)) onlyTrustedNode(msg.sender) {
        // Check settings
        RocketNetworkSettingsInterface rocketNetworkSettings = RocketNetworkSettingsInterface(getContractAddress("rocketNetworkSettings"));
        require(rocketNetworkSettings.getSubmitPricesEnabled(), "Submitting prices is currently disabled");
        // Check block
        require(_block > getPricesBlock(), "Network prices for an equal or higher block are set");
        // Get submission keys
        bytes32 nodeSubmissionKey = keccak256(abi.encodePacked("network.prices.submitted.node", msg.sender, _block, _rplPrice));
        bytes32 submissionCountKey = keccak256(abi.encodePacked("network.prices.submitted.count", _block, _rplPrice));
        // Check & update node submission status
        require(!getBool(nodeSubmissionKey), "Duplicate submission from node");
        setBool(nodeSubmissionKey, true);
        setBool(keccak256(abi.encodePacked("network.prices.submitted.node", msg.sender, _block)), true);
        // Increment submission count
        uint256 submissionCount = getUint(submissionCountKey).add(1);
        setUint(submissionCountKey, submissionCount);
        // Emit prices submitted event
        emit PricesSubmitted(msg.sender, _block, _rplPrice, now);
        // Check submission count & update network prices
        uint256 calcBase = 1 ether;
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        if (calcBase.mul(submissionCount).div(rocketDAONodeTrusted.getMemberCount()) >= rocketNetworkSettings.getNodeConsensusThreshold()) {
            updatePrices(_block, _rplPrice);
        }
    }

    // Update network price data
    function updatePrices(uint256 _block, uint256 _rplPrice) private {
        // Update prices
        setPricesBlock(_block);
        setRPLPrice(_rplPrice);
        // Emit prices updated event
        emit PricesUpdated(_block, _rplPrice, now);
    }

}
