// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

import "../RocketBase.sol";
import "../../types/MinipoolStatus.sol";
import "../../types/NodeDetails.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/node/RocketNodeDistributorFactoryInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/node/RocketNodeDistributorInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsRewardsInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/util/IERC20.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/megapool/RocketMegapoolInterface.sol";
import "../../interface/megapool/RocketMegapoolFactoryInterface.sol";

/// @notice Node registration and management
contract RocketNodeManager is RocketBase, RocketNodeManagerInterface {

    // Events
    event NodeRegistered(address indexed node, uint256 time);
    event NodeTimezoneLocationSet(address indexed node, uint256 time);
    event NodeRewardNetworkChanged(address indexed node, uint256 network);
    event NodeSmoothingPoolStateChanged(address indexed node, bool state);
    event NodeRPLWithdrawalAddressSet(address indexed node, address indexed withdrawalAddress, uint256 time);
    event NodeRPLWithdrawalAddressUnset(address indexed node, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 4;
    }

    /// @notice Get the number of nodes in the network
    function getNodeCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.index")));
    }

    /// @notice Get a breakdown of the number of nodes per timezone
    function getNodeCountPerTimezone(uint256 _offset, uint256 _limit) override external view returns (TimezoneCount[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Calculate range
        uint256 totalNodes = addressSetStorage.getCount(nodeKey);
        uint256 max = _offset + _limit;
        if (max > totalNodes || _limit == 0) { max = totalNodes; }
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
    function getNodePendingRPLWithdrawalAddress(address _nodeAddress) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress)));
    }

    /// @notice Returns true if a node has set an RPL withdrawal address
    function getNodeRPLWithdrawalAddressIsSet(address _nodeAddress) override external view returns (bool) {
        return(getAddress(keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress))) != address(0));
    }

    /// @notice Unsets a node operator's RPL withdrawal address returning it to the default
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
        // Set pending withdrawal address if not confirmed
        else {
            setAddress(keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress)), _newRPLWithdrawalAddress);
        }
    }

    /// @notice Confirm a node's new RPL withdrawal address
    function confirmRPLWithdrawalAddress(address _nodeAddress) external override onlyRegisteredNode(_nodeAddress) {
        bytes32 pendingKey = keccak256(abi.encodePacked("node.pending.rpl.withdrawal.address", _nodeAddress));
        // Get node by pending withdrawal address
        require(getAddress(pendingKey) == msg.sender, "Confirmation must come from the pending RPL withdrawal address");
        deleteAddress(pendingKey);
        // Update withdrawal address
        updateRPLWithdrawalAddress(_nodeAddress, msg.sender);
    }

    /// @notice Update a node's withdrawal address
    function updateRPLWithdrawalAddress(address _nodeAddress, address _newWithdrawalAddress) private {
        // Set new withdrawal address
        setAddress(keccak256(abi.encodePacked("node.rpl.withdrawal.address", _nodeAddress)), _newWithdrawalAddress);
        // Emit withdrawal address set event
        emit NodeRPLWithdrawalAddressSet(_nodeAddress, _newWithdrawalAddress, block.timestamp);
    }

    /// @notice Get a node's timezone location
    function getNodeTimezoneLocation(address _nodeAddress) override public view returns (string memory) {
        return getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }

    /// @notice Register a new node with Rocket Pool
    function registerNode(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) {
        // Load contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getRegistrationEnabled(), "Rocket Pool node registrations are currently disabled");
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Initialise node data
        setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        setBool(keccak256(abi.encodePacked("node.voting.enabled", msg.sender)), true);
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        setBool(keccak256(abi.encodePacked("node.express.provisioned", msg.sender)), true);
        // TODO: Parameterise `express_queue_tickets_base_provision`
        uint256 expressQueueTicketsBaseProvision = 2;
        setUint(keccak256(abi.encodePacked("node.express.tickets")), expressQueueTicketsBaseProvision);
        // Add node to index
        bytes32 nodeIndexKey = keccak256(abi.encodePacked("nodes.index"));
        addressSetStorage.addItem(nodeIndexKey, msg.sender);
        // Initialise fee distributor for this node
        _initialiseFeeDistributor(msg.sender);
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
    function getNodeRegistrationTime(address _nodeAddress) onlyRegisteredNode(_nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rewards.pool.claim.contract.registered.time", "rocketClaimNode", _nodeAddress)));
    }

    /// @notice Set a node's timezone location
    function setTimezoneLocation(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Set timezone location
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Emit node timezone location set event
        emit NodeTimezoneLocationSet(msg.sender, block.timestamp);
    }

    /// @notice Returns true if node has initialised their fee distributor contract
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
    function initialiseFeeDistributor() override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Prevent multiple calls
        require(!getFeeDistributorInitialised(msg.sender), "Already initialised");
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Calculate and set current average fee numerator
        uint256 count = rocketMinipoolManager.getNodeMinipoolCount(msg.sender);
        if (count > 0){
            uint256 numerator = 0;
            // Note: this loop is safe as long as all current node operators at the time of upgrade have few enough minipools
            for (uint256 i = 0; i < count; ++i) {
                RocketMinipoolInterface minipool = RocketMinipoolInterface(rocketMinipoolManager.getNodeMinipoolAt(msg.sender, i));
                if (minipool.getStatus() == MinipoolStatus.Staking){
                    numerator = numerator + minipool.getNodeFee();
                }
            }
            setUint(keccak256(abi.encodePacked("node.average.fee.numerator", msg.sender)), numerator);
        }
        // Create the distributor contract
        _initialiseFeeDistributor(msg.sender);
    }

    /// @notice Deploys the fee distributor contract for a given node
    function _initialiseFeeDistributor(address _nodeAddress) internal {
        // Load contracts
        RocketNodeDistributorFactoryInterface rocketNodeDistributorFactory = RocketNodeDistributorFactoryInterface(getContractAddress("rocketNodeDistributorFactory"));
        // Create the distributor proxy
        rocketNodeDistributorFactory.createProxy(_nodeAddress);
    }

    /// @notice Calculates a nodes average node fee
    function getAverageNodeFee(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Get valid deposit amounts
        uint256[] memory depositSizes = rocketNodeDeposit.getDepositAmounts();
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
    function getRewardNetwork(address _nodeAddress) override public view onlyLatestContract("rocketNodeManager", address(this)) returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.reward.network", _nodeAddress)));
    }

    /// @notice Allows a node to register or deregister from the smoothing pool
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
    function getSmoothingPoolRegistrationState(address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.smoothing.pool.state", _nodeAddress)));
    }

    /// @notice Returns the timestamp of when the node last changed their smoothing pool registration state
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
        if (max > totalNodes || _limit == 0) { max = totalNodes; }
        uint256 count = 0;
        for (uint256 i = _offset; i < max; ++i) {
            address nodeAddress = addressSetStorage.getItem(nodeKey, i);
            if (getSmoothingPoolRegistrationState(nodeAddress)) {
                count++;
            }
        }
        return count;
    }

    /// @notice Convenience function to return all on-chain details about a given node
    /// @param _nodeAddress Address of the node to query details for
    function getNodeDetails(address _nodeAddress) override public view returns (NodeDetails memory nodeDetails) {
        // Get contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        RocketNodeDepositInterface rocketNodeDeposit = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        RocketNodeDistributorFactoryInterface rocketNodeDistributorFactory = RocketNodeDistributorFactoryInterface(getContractAddress("rocketNodeDistributorFactory"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        IERC20 rocketTokenRETH = IERC20(getContractAddress("rocketTokenRETH"));
        IERC20 rocketTokenRPL = IERC20(getContractAddress("rocketTokenRPL"));
        IERC20 rocketTokenRPLFixedSupply = IERC20(getContractAddress("rocketTokenRPLFixedSupply"));
        // Node details
        nodeDetails.nodeAddress = _nodeAddress;
        nodeDetails.withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        nodeDetails.pendingWithdrawalAddress = rocketStorage.getNodePendingWithdrawalAddress(_nodeAddress);
        nodeDetails.exists = getNodeExists(_nodeAddress);
        nodeDetails.registrationTime = getNodeRegistrationTime(_nodeAddress);
        nodeDetails.timezoneLocation = getNodeTimezoneLocation(_nodeAddress);
        nodeDetails.feeDistributorInitialised = getFeeDistributorInitialised(_nodeAddress);
        nodeDetails.rewardNetwork = getRewardNetwork(_nodeAddress);
        // Staking details
        nodeDetails.rplStake = rocketNodeStaking.getNodeRPLStake(_nodeAddress);
        nodeDetails.effectiveRPLStake = rocketNodeStaking.getNodeEffectiveRPLStake(_nodeAddress);
        nodeDetails.minimumRPLStake = rocketNodeStaking.getNodeMinimumRPLStake(_nodeAddress);
        nodeDetails.maximumRPLStake = rocketNodeStaking.getNodeMaximumRPLStake(_nodeAddress);
        nodeDetails.ethMatched = rocketNodeStaking.getNodeETHMatched(_nodeAddress);
        nodeDetails.ethMatchedLimit = rocketNodeStaking.getNodeETHMatchedLimit(_nodeAddress);
        // Distributor details
        nodeDetails.feeDistributorAddress = rocketNodeDistributorFactory.getProxyAddress(_nodeAddress);
        uint256 distributorBalance = nodeDetails.feeDistributorAddress.balance;
        RocketNodeDistributorInterface distributor = RocketNodeDistributorInterface(nodeDetails.feeDistributorAddress);
        nodeDetails.distributorBalanceNodeETH = distributor.getNodeShare();
        nodeDetails.distributorBalanceUserETH = distributorBalance - nodeDetails.distributorBalanceNodeETH;
        // Minipool details
        nodeDetails.minipoolCount = rocketMinipoolManager.getNodeMinipoolCount(_nodeAddress);
        // Balance details
        nodeDetails.balanceETH = _nodeAddress.balance;
        nodeDetails.balanceRETH = rocketTokenRETH.balanceOf(_nodeAddress);
        nodeDetails.balanceRPL = rocketTokenRPL.balanceOf(_nodeAddress);
        nodeDetails.balanceOldRPL = rocketTokenRPLFixedSupply.balanceOf(_nodeAddress);
        nodeDetails.depositCreditBalance = rocketNodeDeposit.getNodeDepositCredit(_nodeAddress);
        // Return
        return nodeDetails;
    }

    /// @notice Returns a slice of the node operator address set
    /// @param _offset The starting point into the slice
    /// @param _limit The maximum number of results to return
    function getNodeAddresses(uint256 _offset, uint256 _limit) override external view returns (address[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Iterate over the requested minipool range
        uint256 totalNodes = getNodeCount();
        uint256 max = _offset + _limit;
        if (max > totalNodes || _limit == 0) { max = totalNodes; }
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

    /// @notice Deploys a single Megapool contract
    /// @param _nodeAddress address of the node associated to the megapool
    function deployMegapool(address _nodeAddress) override external returns (address) {
        require(getMegapoolAddress(_nodeAddress) == address(0), "Megapool already deployed for this node");

        RocketMegapoolFactoryInterface rocketMegapool = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        return rocketMegapool.deployContract(_nodeAddress);
    }

    /// @notice Returns true if node has deployed their Megapool contract
    /// @param _nodeAddress address of the node associated to the megapool
    function getMegapoolAddress(address _nodeAddress) override public view returns (address) {
        // Load contracts
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        // Get Megapool address
        address contractAddress = rocketMegapoolFactory.getExpectedAddress(_nodeAddress);
        // Check if contract exists at that address
        uint32 codeSize;
        assembly {
            codeSize := extcodesize(contractAddress)
        }
        if (codeSize > 0) {
            return contractAddress;
        }
        return address(0);
    }

    /// @notice Returns the number of express tickets the given node has
    /// @param _nodeAddress Address of the node operator to query
    function getExpressTicketCount(address _nodeAddress) external override view returns (uint256) {
        bool provisioned = getBool(keccak256(abi.encodePacked("node.express.provisioned", _nodeAddress)));

        uint256 expressTickets = 0;

        if (!provisioned) {
            // Nodes prior to Saturn should receive 2 express tickets (initial value of `express_queue_tickets_base_provision`)
            expressTickets += 2;
            // Each node SHALL be provided additional express_queue_tickets equal to (bonded ETH in legacy minipools)/4
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            uint256 ethProvided = rocketNodeStaking.getNodeETHProvided(_nodeAddress);
            expressTickets += ethProvided / 4 ether;
        }

        expressTickets += getUint(keccak256(abi.encodePacked("node.express.tickets")));

        return expressTickets;
    }

    /// @notice Consumes an express ticket for the given node operator
    /// @param _nodeAddress Address of the node operator to consume express ticket for
    function useExpressTicket(address _nodeAddress) external override {
        uint256 tickets = getExpressTicketCount(_nodeAddress);
        require(tickets > 0, "No express tickets");
        tickets -= 1;
        setBool(keccak256(abi.encodePacked("node.express.provisioned", _nodeAddress)), true);
        setUint(keccak256(abi.encodePacked("node.express.tickets")), tickets);
    }
}
