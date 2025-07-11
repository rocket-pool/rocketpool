// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketVaultWithdrawerInterface} from "../../interface/RocketVaultWithdrawerInterface.sol";
import {RocketDAONodeTrustedSettingsRewardsInterface} from "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsRewardsInterface.sol";
import {RocketDAOProtocolSettingsDepositInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketDAOProtocolSettingsNodeInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import {RocketDAOProtocolSettingsRewardsInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketNodeDistributorFactoryInterface} from "../../interface/node/RocketNodeDistributorFactoryInterface.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {AddressSetStorageInterface} from "../../interface/util/AddressSetStorageInterface.sol";
import {MinipoolStatus} from "../../types/MinipoolStatus.sol";
import {RocketBase} from "../RocketBase.sol";

pragma abicoder v2;

/// @notice Node registration and management
contract RocketNodeManager is RocketBase, RocketNodeManagerInterface, RocketVaultWithdrawerInterface {

    // Events
    event NodeRegistered(address indexed node, uint256 time);
    event NodeTimezoneLocationSet(address indexed node, uint256 time);
    event NodeRewardNetworkChanged(address indexed node, uint256 network);
    event NodeSmoothingPoolStateChanged(address indexed node, bool state);
    event NodeRPLWithdrawalAddressSet(address indexed node, address indexed withdrawalAddress, uint256 time);
    event NodeRPLWithdrawalAddressUnset(address indexed node, uint256 time);
    event NodeUnclaimedRewardsAdded(address indexed node, uint256 amount, uint256 time);
    event NodeUnclaimedRewardsClaimed(address indexed node, uint256 amount, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 5;
    }

    /// @notice Accepts ETH withdrawn from the vault
    function receiveVaultWithdrawalETH() external payable {
        // Do nothing
    }

    /// @notice Get the number of nodes in the network
    function getNodeCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.index")));
    }

    /// @notice Get a breakdown of the number of nodes per timezone
    /// @dev Iterating the entire set may exceed gas limit so caller can paginate using _offset and _limit
    function getNodeCountPerTimezone(uint256 _offset, uint256 _limit) override external view returns (TimezoneCount[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Calculate range
        uint256 totalNodes = addressSetStorage.getCount(nodeKey);
        uint256 max = _offset + _limit;
        if (max > totalNodes || _limit == 0) {max = totalNodes;}
        // Create an array with as many elements as there are potential values to return
        TimezoneCount[] memory counts = new TimezoneCount[](max - _offset);
        uint256 uniqueTimezoneCount = 0;
        // Iterate the minipool range
        for (uint256 i = _offset; i < max; ++i) {
            address nodeAddress = addressSetStorage.getItem(nodeKey, i);
            string memory timezone = getString(keccak256(abi.encodePacked("node.timezone.location", nodeAddress)));
            // Find existing entry in our array
            bool existing = false;
            for (uint256 j = 0; j < uniqueTimezoneCount; ++j) {
                if (keccak256(bytes(counts[j].timezone)) == keccak256(bytes(timezone))) {
                    existing = true;
                    // Increment the counter
                    counts[j].count++;
                    break;
                }
            }
            // Entry was not found, so create a new one
            if (!existing) {
                counts[uniqueTimezoneCount].timezone = timezone;
                counts[uniqueTimezoneCount].count = 1;
                uniqueTimezoneCount++;
            }
        }
        // Dirty hack to cut unused elements off end of return value
        assembly {
            mstore(counts, uniqueTimezoneCount)
        }
        return counts;
    }

    /// @notice Get a node address by index
    function getNodeAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.index")), _index);
    }

    /// @notice Check whether a node exists
    function getNodeExists(address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress)));
    }

    /// @notice Get a node's current withdrawal address
    function getNodeWithdrawalAddress(address _nodeAddress) override public view returns (address) {
        return rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
    }

    /// @notice Get a node's pending withdrawal address
    function getNodePendingWithdrawalAddress(address _nodeAddress) override public view returns (address) {
        return rocketStorage.getNodePendingWithdrawalAddress(_nodeAddress);
    }

    /// @notice Get a node's current RPL withdrawal address
    function getNodeRPLWithdrawalAddress(address _nodeAddress) override public view returns (address) {
        address withdrawalAddress = getAddress(keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress)));
        if (withdrawalAddress == address(0)) {
            // Defaults to current withdrawal address if unset
            return rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        }
        return withdrawalAddress;
    }

    /// @notice Get a node's pending RPL withdrawal address
    /// @param _nodeAddress Address of the node to query
    function getNodePendingRPLWithdrawalAddress(address _nodeAddress) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress)));
    }

    /// @notice Returns true if a node has set an RPL withdrawal address
    /// @param _nodeAddress Address of the node to query
    function getNodeRPLWithdrawalAddressIsSet(address _nodeAddress) override external view returns (bool) {
        return (getAddress(keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress))) != address(0));
    }

    /// @notice Unsets a node operator's RPL withdrawal address returning it to the default
    /// @param _nodeAddress Address of the node to query
    function unsetRPLWithdrawalAddress(address _nodeAddress) external override onlyRegisteredNode(_nodeAddress) {
        bytes32 addressKey = keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress));
        // Confirm the transaction is from the node's current RPL withdrawal address
        require(getAddress(addressKey) == msg.sender, "Only a tx from a node's RPL withdrawal address can unset it");
        // Unset the address
        deleteAddress(addressKey);
        // Emit withdrawal address unset event
        emit NodeRPLWithdrawalAddressUnset(_nodeAddress, block.timestamp);
    }

    // @notice Set a node's RPL withdrawal address
    /// @param _nodeAddress Address of the node to set RPL withdrawal address for
    /// @param _newRPLWithdrawalAddress The new RPL withdrawal address to set
    /// @param _confirm Whether to instantly make the change or requires a confirmation from the new address
    function setRPLWithdrawalAddress(address _nodeAddress, address _newRPLWithdrawalAddress, bool _confirm) external override onlyRegisteredNode(_nodeAddress) {
        // Check new RPL withdrawal address
        require(_newRPLWithdrawalAddress != address(0x0), "Invalid RPL withdrawal address");
        // Confirm the transaction is from the node's current RPL withdrawal address
        address withdrawalAddress = getNodeRPLWithdrawalAddress(_nodeAddress);
        require(withdrawalAddress == msg.sender, "Only a tx from a node's RPL withdrawal address can update it");
        // Update immediately if confirmed
        if (_confirm) {
            // Delete any existing pending update
            deleteAddress(keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress)));
            // Perform the update
            updateRPLWithdrawalAddress(_nodeAddress, _newRPLWithdrawalAddress);
        }
        else {
            // Set pending withdrawal address immediately
            setAddress(keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress)), _newRPLWithdrawalAddress);
        }
    }

    /// @notice Confirm a node's new RPL withdrawal address
    /// @param _nodeAddress Address of the node to confirm new RPL withdrawal address for
    function confirmRPLWithdrawalAddress(address _nodeAddress) external override onlyRegisteredNode(_nodeAddress) {
        bytes32 pendingKey = keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress));
        // Get node by pending withdrawal address
        require(getAddress(pendingKey) == msg.sender, "Confirmation must come from the pending RPL withdrawal address");
        deleteAddress(pendingKey);
        // Update withdrawal address
        updateRPLWithdrawalAddress(_nodeAddress, msg.sender);
    }

    /// @dev Internal implementation of updating a node's RPL withdrawal address
    /// @param _nodeAddress Address of the node to set RPL withdrawal address for
    /// @param _newRPLWithdrawalAddress The new RPL withdrawal address to set
    function updateRPLWithdrawalAddress(address _nodeAddress, address _newRPLWithdrawalAddress) private {
        // Set new withdrawal address
        setAddress(keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress)), _newRPLWithdrawalAddress);
        // Emit withdrawal address set event
        emit NodeRPLWithdrawalAddressSet(_nodeAddress, _newRPLWithdrawalAddress, block.timestamp);
    }

    /// @notice Get a node's timezone location
    /// @param _nodeAddress Address of the node to query
    function getNodeTimezoneLocation(address _nodeAddress) override public view returns (string memory) {
        return getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }

    /// @notice Register a new node with Rocket Pool
    /// @param _timezoneLocation Timezone of the node operator (used only as a hint to the protocol about its geographic diversity)
    function registerNode(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) {
        // Load contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getRegistrationEnabled(), "Rocket Pool node registrations are currently disabled");
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Initialise node data
        setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        setBool(keccak256(abi.encodePacked("node.voting.enabled", msg.sender)), true);
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        setBool(keccak256(abi.encodePacked("node.express.provisioned", msg.sender)), true);
        setUint(keccak256(abi.encodePacked("node.express.tickets", msg.sender)), rocketDAOProtocolSettingsDeposit.getExpressQueueTicketsBaseProvision());
        // Add node to index
        bytes32 nodeIndexKey = keccak256(abi.encodePacked("nodes.index"));
        addressSetStorage.addItem(nodeIndexKey, msg.sender);
        // Set node registration time (uses old storage key name for backwards compatibility)
        setUint(keccak256(abi.encodePacked("rewards.pool.claim.contract.registered.time", "rocketClaimNode", msg.sender)), block.timestamp);
        // Update count
        rocketNetworkSnapshots.push(keccak256(abi.encodePacked("node.count")), uint224(addressSetStorage.getCount(nodeIndexKey)));
        // Default voting delegate to themself
        rocketNetworkSnapshots.push(keccak256(abi.encodePacked("node.delegate", msg.sender)), uint224(uint160(msg.sender)));
        // Emit node registered event
        emit NodeRegistered(msg.sender, block.timestamp);
    }

    /// @notice Gets the timestamp of when a node was registered
    /// @param _nodeAddress Address of the node to query
    function getNodeRegistrationTime(address _nodeAddress) onlyRegisteredNode(_nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rewards.pool.claim.contract.registered.time", "rocketClaimNode", _nodeAddress)));
    }

    /// @notice Set a node's timezone location
    /// @param _timezoneLocation New timezone of the node operator
    function setTimezoneLocation(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Set timezone location
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Emit node timezone location set event
        emit NodeTimezoneLocationSet(msg.sender, block.timestamp);
    }

    /// @notice Returns true if node has initialised their fee distributor contract
    /// @param _nodeAddress Address of the node to query
    function getFeeDistributorInitialised(address _nodeAddress) override public view returns (bool) {
        // Load contracts
        RocketNodeDistributorFactoryInterface rocketNodeDistributorFactory = RocketNodeDistributorFactoryInterface(getContractAddress("rocketNodeDistributorFactory"));
        // Get distributor address
        address contractAddress = rocketNodeDistributorFactory.getProxyAddress(_nodeAddress);
        // Check if contract exists at that address
        uint32 codeSize;
        assembly {
            codeSize := extcodesize(contractAddress)
        }
        return codeSize > 0;
    }

    /// @notice Node operators created before the distributor was implemented must call this to setup their distributor contract
    /// @dev Fee distributor is no longer used but this function is provided for backwards compatibility for existing node operators who never initialised theirs
    function initialiseFeeDistributor() override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Prevent multiple calls
        require(!getFeeDistributorInitialised(msg.sender), "Already initialised");
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Calculate and set current average fee numerator
        uint256 count = rocketMinipoolManager.getNodeMinipoolCount(msg.sender);
        if (count > 0) {
            uint256 numerator = 0;
            // Note: this loop is safe as long as all current node operators at the time of upgrade have few enough minipools
            for (uint256 i = 0; i < count; ++i) {
                RocketMinipoolInterface minipool = RocketMinipoolInterface(rocketMinipoolManager.getNodeMinipoolAt(msg.sender, i));
                if (minipool.getStatus() == MinipoolStatus.Staking) {
                    numerator = numerator + minipool.getNodeFee();
                }
            }
            setUint(keccak256(abi.encodePacked("node.average.fee.numerator", msg.sender)), numerator);
        }
        // Create the distributor contract
        _initialiseFeeDistributor(msg.sender);
    }

    /// @dev Deploys the fee distributor contract for a given node
    function _initialiseFeeDistributor(address _nodeAddress) internal {
        // Load contracts
        RocketNodeDistributorFactoryInterface rocketNodeDistributorFactory = RocketNodeDistributorFactoryInterface(getContractAddress("rocketNodeDistributorFactory"));
        // Create the distributor proxy
        rocketNodeDistributorFactory.createProxy(_nodeAddress);
    }

    /// @notice Calculates a node's average node fee (for minipools)
    /// @param _nodeAddress Address of the node to query
    function getAverageNodeFee(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Get valid deposit amounts
        uint256[2] memory depositSizes;
        depositSizes[0] = 16 ether;
        depositSizes[1] = 8 ether;
        // Setup memory for calculations
        uint256[] memory depositWeights = new uint256[](depositSizes.length);
        uint256[] memory depositCounts = new uint256[](depositSizes.length);
        uint256 depositWeightTotal;
        uint256 totalCount;
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        // Retrieve the number of staking minipools per deposit size
        for (uint256 i = 0; i < depositSizes.length; ++i) {
            depositCounts[i] = rocketMinipoolManager.getNodeStakingMinipoolCountBySize(_nodeAddress, depositSizes[i]);
            totalCount = totalCount + depositCounts[i];
        }
        if (totalCount == 0) {
            return 0;
        }
        // Calculate the weights of each deposit size
        for (uint256 i = 0; i < depositSizes.length; ++i) {
            depositWeights[i] = (launchAmount - depositSizes[i]) * depositCounts[i];
            depositWeightTotal = depositWeightTotal + depositWeights[i];
        }
        for (uint256 i = 0; i < depositSizes.length; ++i) {
            depositWeights[i] = depositWeights[i] * calcBase / depositWeightTotal;
        }
        // Calculate the weighted average
        uint256 weightedAverage = 0;
        for (uint256 i = 0; i < depositSizes.length; ++i) {
            if (depositCounts[i] > 0) {
                bytes32 numeratorKey;
                if (depositSizes[i] == 16 ether) {
                    numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress));
                } else {
                    numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress, depositSizes[i]));
                }
                uint256 numerator = getUint(numeratorKey);
                weightedAverage = weightedAverage + (numerator * depositWeights[i] / depositCounts[i]);
            }
        }
        return weightedAverage / calcBase;
    }

    /// @notice Designates which network a node would like their rewards relayed to
    /// @param _nodeAddress Address of the node to set reward network for
    /// @param _network ID of the network
    function setRewardNetwork(address _nodeAddress, uint256 _network) override external onlyLatestContract("rocketNodeManager", address(this)) {
        // Confirm the transaction is from the node's current withdrawal address
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(withdrawalAddress == msg.sender, "Only a tx from a node's withdrawal address can change reward network");
        // Check network is enabled
        RocketDAONodeTrustedSettingsRewardsInterface rocketDAONodeTrustedSettingsRewards = RocketDAONodeTrustedSettingsRewardsInterface(getContractAddress("rocketDAONodeTrustedSettingsRewards"));
        require(rocketDAONodeTrustedSettingsRewards.getNetworkEnabled(_network), "Network is not enabled");
        // Set the network
        setUint(keccak256(abi.encodePacked("node.reward.network", _nodeAddress)), _network);
        // Emit event
        emit NodeRewardNetworkChanged(_nodeAddress, _network);
    }

    /// @notice Returns which network a node has designated as their desired reward network
    /// @param _nodeAddress Address of the node to query
    function getRewardNetwork(address _nodeAddress) override public view onlyLatestContract("rocketNodeManager", address(this)) returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.reward.network", _nodeAddress)));
    }

    /// @notice Allows a node to register or deregister from the smoothing pool
    /// @param _state True to opt in to the smoothing pool or false otherwise
    function setSmoothingPoolRegistrationState(bool _state) override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Ensure registration is enabled
        RocketDAOProtocolSettingsNodeInterface daoSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        require(daoSettingsNode.getSmoothingPoolRegistrationEnabled(), "Smoothing pool registrations are not active");
        // Precompute storage keys
        bytes32 changeKey = keccak256(abi.encodePacked("node.smoothing.pool.changed.time", msg.sender));
        bytes32 stateKey = keccak256(abi.encodePacked("node.smoothing.pool.state", msg.sender));
        // Get from the DAO settings
        RocketDAOProtocolSettingsRewardsInterface daoSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        uint256 rewardInterval = daoSettingsRewards.getRewardsClaimIntervalTime();
        // Ensure node operator has waited the required time
        uint256 lastChange = getUint(changeKey);
        require(block.timestamp >= lastChange + rewardInterval, "Not enough time has passed since changing state");
        // Ensure state is actually changing
        require(getBool(stateKey) != _state, "Invalid state change");
        // Update registration state
        setUint(changeKey, block.timestamp);
        setBool(stateKey, _state);
        // Emit state change event
        emit NodeSmoothingPoolStateChanged(msg.sender, _state);
    }

    /// @notice Returns whether a node is registered or not from the smoothing pool
    /// @param _nodeAddress Address of the node to query
    function getSmoothingPoolRegistrationState(address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.smoothing.pool.state", _nodeAddress)));
    }

    /// @notice Returns the timestamp of when the node last changed their smoothing pool registration state
    /// @param _nodeAddress Address of the node to query
    function getSmoothingPoolRegistrationChanged(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.smoothing.pool.changed.time", _nodeAddress)));
    }

    /// @notice Returns the sum of nodes that are registered for the smoothing pool between _offset and (_offset + _limit)
    function getSmoothingPoolRegisteredNodeCount(uint256 _offset, uint256 _limit) override external view returns (uint256) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Iterate over the requested minipool range
        uint256 totalNodes = getNodeCount();
        uint256 max = _offset + _limit;
        if (max > totalNodes || _limit == 0) {max = totalNodes;}
        uint256 count = 0;
        for (uint256 i = _offset; i < max; ++i) {
            address nodeAddress = addressSetStorage.getItem(nodeKey, i);
            if (getSmoothingPoolRegistrationState(nodeAddress)) {
                count++;
            }
        }
        return count;
    }

    /// @notice Returns a slice of the node operator address set
    /// @param _offset The starting point for the slice
    /// @param _limit The maximum number of results to return in the slice
    function getNodeAddresses(uint256 _offset, uint256 _limit) override external view returns (address[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Iterate over the requested minipool range
        uint256 totalNodes = getNodeCount();
        uint256 max = _offset + _limit;
        if (max > totalNodes || _limit == 0) {max = totalNodes;}
        // Create array big enough for every minipool
        address[] memory nodes = new address[](max - _offset);
        uint256 total = 0;
        for (uint256 i = _offset; i < max; ++i) {
            nodes[total] = addressSetStorage.getItem(nodeKey, i);
            total++;
        }
        // Dirty hack to cut unused elements off end of return value
        assembly {
            mstore(nodes, total)
        }
        return nodes;
    }

    /// @notice Deploys a single Megapool contract for the calling node operator
    function deployMegapool() override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) returns (address) {
        RocketMegapoolFactoryInterface rocketMegapool = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        require(!rocketMegapool.getMegapoolDeployed(msg.sender), "Megapool already deployed for this node");
        return rocketMegapool.deployContract(msg.sender);
    }

    /// @notice Returns the number of express tickets the given node has
    /// @param _nodeAddress Address of the node operator to query
    function getExpressTicketCount(address _nodeAddress) public override view returns (uint256) {
        bool provisioned = getBool(keccak256(abi.encodePacked("node.express.provisioned", _nodeAddress)));
        uint256 expressTickets = 0;
        if (!provisioned) {
            // Nodes prior to Saturn should receive 2 express tickets (initial value of `express_queue_tickets_base_provision`)
            expressTickets += 2;
            // Each node SHALL be provided additional express_queue_tickets equal to (bonded ETH in legacy minipools)/4
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            uint256 bondedETH = rocketNodeStaking.getNodeETHBonded(_nodeAddress);
            expressTickets += bondedETH / 4 ether;
        }
        expressTickets += getUint(keccak256(abi.encodePacked("node.express.tickets", _nodeAddress)));
        return expressTickets;
    }

    /// @notice Consumes an express ticket for the given node operator
    /// @param _nodeAddress Address of the node operator to consume express ticket for
    function useExpressTicket(address _nodeAddress) external override onlyLatestContract("rocketNodeManager", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) {
        uint256 tickets = getExpressTicketCount(_nodeAddress);
        require(tickets > 0, "No express tickets");
        tickets -= 1;
        setBool(keccak256(abi.encodePacked("node.express.provisioned", _nodeAddress)), true);
        setUint(keccak256(abi.encodePacked("node.express.tickets", _nodeAddress)), tickets);
    }

    /// @notice Calculates a node operator's entitled express tickets and stores them
    /// @param _nodeAddress Address of the node operator to provision
    function provisionExpressTickets(address _nodeAddress) external override onlyLatestContract("rocketNodeManager", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) {
        bytes32 provisionedKey = keccak256(abi.encodePacked("node.express.provisioned", _nodeAddress));
        if (getBool(provisionedKey)) {
            return;
        }
        uint256 tickets = getExpressTicketCount(_nodeAddress);
        setBool(provisionedKey, true);
        setUint(keccak256(abi.encodePacked("node.express.tickets", _nodeAddress)), tickets);
    }

    /// @notice Refunds an express ticket for the given node operator
    /// @param _nodeAddress Address of the node operator to refund express ticket for
    function refundExpressTicket(address _nodeAddress) external override onlyLatestContract("rocketNodeManager", address(this)) onlyLatestContract("rocketDepositPool", msg.sender) {
        // Refunds can only occur after the use of a ticket which guarantees tickets were provisioned
        addUint(keccak256(abi.encodePacked("node.express.tickets", _nodeAddress)), 1);
    }

    /// @notice Convenience function to return the megapool address for a node if it is deployed, otherwise null address
    /// @param _nodeAddress Address of the node to query
    function getMegapoolAddress(address _nodeAddress) override external view returns (address) {
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        if (rocketMegapoolFactory.getMegapoolDeployed(_nodeAddress)) {
            return rocketMegapoolFactory.getExpectedAddress(_nodeAddress);
        }
        return address(0x0);
    }

    /// @notice Returns the amount of unclaimed ETH rewards for a given node operator
    /// @param _nodeAddress Address of the node operator
    function getUnclaimedRewards(address _nodeAddress) external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.unclaimed.rewards", _nodeAddress)));
    }

    /// @notice Add funds to a node's unclaimed balance
    /// @dev Used when a withdrawal address is unable to accept ETH rewards and allows node operator to claim them later
    /// @param _nodeAddress Address of the node operator to increase unclaimed rewards for
    function addUnclaimedRewards(address _nodeAddress) external payable {
        // Deposit funds into vault and increase balance
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.depositEther{value: msg.value}();
        addUint(keccak256(abi.encodePacked("node.unclaimed.rewards", _nodeAddress)), msg.value);
        // Emit event
        emit NodeUnclaimedRewardsAdded(_nodeAddress, msg.value, block.timestamp);
    }

    /// @notice Sends any unclaimed rewards to node operator's withdrawal address
    /// @param _nodeAddress Address of the node operator
    function claimUnclaimedRewards(address _nodeAddress) external onlyRegisteredNode(_nodeAddress) {
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(msg.sender == _nodeAddress || msg.sender == withdrawalAddress, "Only node can claim");
        // Retrieve unclaimed rewards amount and reset balance
        bytes32 key = keccak256(abi.encodePacked("node.unclaimed.rewards", _nodeAddress));
        uint256 amount = getUint(key);
        setUint(key, 0);
        // Withdraw ETH from vault
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawEther(amount);
        // Transfer to node operator's withdrawal address
        (bool success,) = withdrawalAddress.call{value: amount}("");
        require(success, "Failed to send funds to withdrawal address");
        // Emit event
        emit NodeUnclaimedRewardsClaimed(_nodeAddress, amount, block.timestamp);
    }
}
