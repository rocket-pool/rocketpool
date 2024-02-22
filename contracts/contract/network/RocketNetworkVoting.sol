// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "@openzeppelin4/contracts/utils/math/Math.sol";

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/network/RocketNetworkVotingInterface.sol";

/// @notice Accounting for snapshotting of governance related values based on block numbers
contract RocketNetworkVoting is RocketBase, RocketNetworkVotingInterface {

    // Constants
    bytes32 immutable internal priceKey;

    // Events
    event DelegateSet(address nodeOperator, address delegate, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
        // Precompute keys
        priceKey = keccak256("network.prices.rpl");
    }

    /// @notice Unlocks a node operator's voting power (only required for node operators who registered before governance structure was in place)
    function initialiseVoting() onlyRegisteredNode(msg.sender) external override {
        // Check if already registered
        require (!getBool(keccak256(abi.encodePacked("node.voting.enabled", msg.sender))), "Already registered");
        setBool(keccak256(abi.encodePacked("node.voting.enabled", msg.sender)), true);

        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));

        bytes32 key;

        // ETH matched
        key = keccak256(abi.encodePacked("eth.matched.node.amount", msg.sender));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(rocketNodeStaking.getNodeETHMatched(msg.sender)));

        // Active minipools
        key = keccak256(abi.encodePacked("minipools.active.count", msg.sender));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(rocketMinipoolManager.getNodeActiveMinipoolCount(msg.sender)));

        // RPL staked
        key = keccak256(abi.encodePacked("rpl.staked.node.amount", msg.sender));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(rocketNodeStaking.getNodeRPLStake(msg.sender)));

        // Set starting delegate to themself
        key = keccak256(abi.encodePacked("node.delegate", msg.sender));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(uint160(msg.sender)));
    }

    function getVotingInitialised(address _nodeAddress) external override view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.voting.enabled", _nodeAddress)));
    }

    /// @notice Returns the number of registered nodes at a given block
    /// @param _block Block number to query
    function getNodeCount(uint32 _block) external override view returns (uint256) {
        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.count"));
        return uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 10));
    }

    /// @notice Returns the voting power of a given node operator at a specified block
    /// @param _nodeAddress Address of the node operator
    /// @param _block Block number to query
    function getVotingPower(address _nodeAddress, uint32 _block) external override view returns (uint256) {
        // Validate block number
        require(_block <= block.number, "Block must be in the past");

        // Check if the node operator has enabled voting
        if (!getBool(keccak256(abi.encodePacked("node.voting.enabled", _nodeAddress)))) {
            return 0;
        }

        // Get contracts
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));

        // Setup
        bytes32 key;

        // Get ETH matched
        key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        uint256 ethMatched = uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 5));

        // Get active minipools to calculate ETH provided
        key = keccak256(abi.encodePacked("minipools.active.count", _nodeAddress));
        uint256 activeMinipools = rocketNetworkSnapshots.lookupRecent(key, _block, 5);
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        uint256 totalEthStaked = activeMinipools * launchAmount;
        uint256 ethProvided = totalEthStaked - ethMatched;

        // Get RPL price
        uint256 rplPrice = uint256(rocketNetworkSnapshots.lookupRecent(priceKey, _block, 14));

        // Get RPL staked by node operator
        key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        uint256 rplStake = uint256(rocketNetworkSnapshots.lookupRecent(key, _block, 5));

        return calculateVotingPower(rplStake, ethProvided, rplPrice);
    }

    /// @dev Calculates and returns a node's voting power based on the given inputs
    function calculateVotingPower(uint256 rplStake, uint256 providedETH, uint256 rplPrice) internal view returns (uint256) {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // RPL stake cannot exceed maximum
        uint256 maximumStakePercent = rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake();
        uint256 maximumStake = providedETH * maximumStakePercent / rplPrice;
        if (rplStake > maximumStake) {
            rplStake = maximumStake;
        }
        // Return the calculated voting power as the square root of clamped RPL stake
        return Math.sqrt(rplStake);
    }

    function setDelegate(address _newDelegate) external override onlyRegisteredNode(msg.sender) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", msg.sender));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(uint160(_newDelegate)));
        emit DelegateSet(msg.sender, _newDelegate, block.timestamp);
    }

    function getDelegate(address _nodeAddress, uint32 _block) external override view returns (address) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", _nodeAddress));
        return address(uint160(rocketNetworkSnapshots.lookupRecent(key, _block, 10)));
    }

    function getCurrentDelegate(address _nodeAddress) external override view returns (address) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("node.delegate", _nodeAddress));
        return address(uint160(rocketNetworkSnapshots.latestValue(key)));
    }
}
