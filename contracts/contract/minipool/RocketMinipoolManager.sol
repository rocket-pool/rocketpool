// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import "../RocketBase.sol";
import "../../types/MinipoolStatus.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolDetails.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";
import "../../interface/node/RocketNodeDistributorFactoryInterface.sol";
import "../../interface/node/RocketNodeDistributorInterface.sol";
import "../../interface/network/RocketNetworkPenaltiesInterface.sol";
import "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../network/RocketNetworkSnapshots.sol";
import "../node/RocketNodeStaking.sol";

/// @notice Minipool creation, removal and management
contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Events
    event MinipoolCreated(address indexed minipool, address indexed node, uint256 time);
    event MinipoolDestroyed(address indexed minipool, address indexed node, uint256 time);
    event BeginBondReduction(address indexed minipool, uint256 time);
    event CancelReductionVoted(address indexed minipool, address indexed member, uint256 time);
    event ReductionCancelled(address indexed minipool, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 5;
    }

    /// @notice Get the number of minipools in the network
    function getMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(bytes("minipools.index")));
    }

    /// @notice Get the number of minipools in the network in the Staking state
    function getStakingMinipoolCount() override public view returns (uint256) {
        return getUint(keccak256(bytes("minipools.staking.count")));
    }

    /// @notice Get the number of finalised minipools in the network
    function getFinalisedMinipoolCount() override external view returns (uint256) {
        return getUint(keccak256(bytes("minipools.finalised.count")));
    }

    /// @notice Get the number of active minipools in the network
    function getActiveMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        uint256 total = addressSetStorage.getCount(keccak256(bytes("minipools.index")));
        uint256 finalised = getUint(keccak256(bytes("minipools.finalised.count")));
        return total - finalised;
    }

    /// @notice Returns true if a minipool has had an RPL slashing
    function getMinipoolRPLSlashed(address _minipoolAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.rpl.slashed", _minipoolAddress)));
    }

    /// @notice Get the number of minipools in each status.
    ///         Returns the counts for Initialised, Prelaunch, Staking, Withdrawable, and Dissolved in that order.
    /// @param _offset The offset into the minipool set to start
    /// @param _limit The maximum number of minipools to iterate
    function getMinipoolCountPerStatus(uint256 _offset, uint256 _limit) override external view
    returns (uint256 initialisedCount, uint256 prelaunchCount, uint256 stakingCount, uint256 withdrawableCount, uint256 dissolvedCount) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute minipool key
        bytes32 minipoolKey = keccak256(abi.encodePacked("minipools.index"));
        // Iterate over the requested minipool range
        uint256 totalMinipools = getMinipoolCount();
        uint256 max = _offset + _limit;
        if (max > totalMinipools || _limit == 0) { max = totalMinipools; }
        for (uint256 i = _offset; i < max; ++i) {
            // Get the minipool at index i
            RocketMinipoolInterface minipool = RocketMinipoolInterface(addressSetStorage.getItem(minipoolKey, i));
            // Get the minipool's status, and update the appropriate counter
            MinipoolStatus status = minipool.getStatus();
            if (status == MinipoolStatus.Initialised) {
                initialisedCount++;
            }
            else if (status == MinipoolStatus.Prelaunch) {
                prelaunchCount++;
            }
            else if (status == MinipoolStatus.Staking) {
                stakingCount++;
            }
            else if (status == MinipoolStatus.Withdrawable) {
                withdrawableCount++;
            }
            else if (status == MinipoolStatus.Dissolved) {
                dissolvedCount++;
            }
        }
    }

    /// @notice Returns an array of all minipools in the prelaunch state
    /// @param _offset The offset into the minipool set to start iterating
    /// @param _limit The maximum number of minipools to iterate over
    function getPrelaunchMinipools(uint256 _offset, uint256 _limit) override external view
    returns (address[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute minipool key
        bytes32 minipoolKey = keccak256(abi.encodePacked("minipools.index"));
        // Iterate over the requested minipool range
        uint256 totalMinipools = getMinipoolCount();
        uint256 max = _offset + _limit;
        if (max > totalMinipools || _limit == 0) { max = totalMinipools; }
        // Create array big enough for every minipool
        address[] memory minipools = new address[](max - _offset);
        uint256 total = 0;
        for (uint256 i = _offset; i < max; ++i) {
            // Get the minipool at index i
            RocketMinipoolInterface minipool = RocketMinipoolInterface(addressSetStorage.getItem(minipoolKey, i));
            // Get the minipool's status, and to array if it's in prelaunch
            MinipoolStatus status = minipool.getStatus();
            if (status == MinipoolStatus.Prelaunch) {
                minipools[total] = address(minipool);
                total++;
            }
        }
        // Dirty hack to cut unused elements off end of return value
        assembly {
            mstore(minipools, total)
        }
        return minipools;
    }

    /// @notice Get a network minipool address by index
    /// @param _index Index into the minipool set to return
    function getMinipoolAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.index")), _index);
    }

    /// @notice Get the number of minipools owned by a node
    /// @param _nodeAddress The node operator to query the count of minipools of
    function getNodeMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
    }

    /// @notice Get the number of minipools owned by a node that are not finalised
    /// @param _nodeAddress The node operator to query the count of active minipools of
    function getNodeActiveMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked("minipools.active.count", _nodeAddress));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        (bool exists,, uint224 count) = rocketNetworkSnapshots.latest(key);
        if (!exists){
            // Fallback to old value
            AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
            uint256 finalised = getUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)));
            uint256 total = addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
            return total - finalised;
        }
        return uint256(count);
    }

    /// @notice Get the number of minipools owned by a node that are finalised
    /// @param _nodeAddress The node operator to query the count of finalised minipools of
    function getNodeFinalisedMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)));
    }

    /// @notice Get the number of minipools owned by a node that are in staking status
    /// @param _nodeAddress The node operator to query the count of staking minipools of
    function getNodeStakingMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        // Get valid deposit amounts
        uint256[2] memory depositSizes;
        depositSizes[0] = 16 ether;
        depositSizes[1] = 8 ether;
        uint256 total;
        for (uint256 i = 0; i < depositSizes.length; ++i){
            total = total + getNodeStakingMinipoolCountBySize(_nodeAddress, depositSizes[i]);
        }
        return total;
    }

    /// @notice Get the number of minipools owned by a node that are in staking status
    /// @param _nodeAddress The node operator to query the count of minipools by desposit size of
    /// @param _depositSize The deposit size to filter result by
    function getNodeStakingMinipoolCountBySize(address _nodeAddress, uint256 _depositSize) override public view returns (uint256) {
        bytes32 nodeKey;
        if (_depositSize == 16 ether){
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress));
        } else {
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress, _depositSize));
        }
        return getUint(nodeKey);
    }

    /// @notice Get a node minipool address by index
    /// @param _nodeAddress The node operator to query the minipool of
    /// @param _index Index into the node operator's set of minipools
    function getNodeMinipoolAt(address _nodeAddress, uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), _index);
    }

    /// @notice Get the number of validating minipools owned by a node
    /// @param _nodeAddress The node operator to query the count of validating minipools of
    function getNodeValidatingMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)));
    }

    /// @notice Get a validating node minipool address by index
    /// @param _nodeAddress The node operator to query the validating minipool of
    /// @param _index Index into the node operator's set of validating minipools
    function getNodeValidatingMinipoolAt(address _nodeAddress, uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)), _index);
    }

    /// @notice Get a minipool address by validator pubkey
    /// @param _pubkey The pubkey to query
    function getMinipoolByPubkey(bytes memory _pubkey) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)));
    }

    /// @notice Returns true if a minipool exists
    /// @param _minipoolAddress The address of the minipool to check the existence of
    function getMinipoolExists(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress)));
    }

    /// @notice Returns true if a minipool previously existed at the given address
    /// @param _minipoolAddress The address to check the previous existence of a minipool at
    function getMinipoolDestroyed(address _minipoolAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.destroyed", _minipoolAddress)));
    }

    /// @notice Returns a minipool's validator pubkey
    /// @param _minipoolAddress The minipool to query the pubkey of
    function getMinipoolPubkey(address _minipoolAddress) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked("minipool.pubkey", _minipoolAddress)));
    }

    /// @notice Calculates what the withdrawal credentials of a minipool should be set to
    /// @param _minipoolAddress The minipool to calculate the withdrawal credentials for
    function getMinipoolWithdrawalCredentials(address _minipoolAddress) override public pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x01), bytes11(0x0), address(_minipoolAddress));
    }

    /// @notice Decrements a node operator's number of staking minipools based on the minipools prior bond amount and
    ///         increments it based on their new bond amount.
    /// @param _previousBond The minipool's previous bond value
    /// @param _newBond The minipool's new bond value
    /// @param _previousFee The fee of the minipool prior to the bond change
    /// @param _newFee The fee of the minipool after the bond change
    function updateNodeStakingMinipoolCount(uint256 _previousBond, uint256 _newBond, uint256 _previousFee, uint256 _newFee) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        bytes32 nodeKey;
        bytes32 numeratorKey;
        // Get contracts
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Try to distribute current fees at previous average commission rate
        _tryDistribute(nodeAddress);
        // Decrement previous bond count
        if (_previousBond == 16 ether){
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", nodeAddress));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", nodeAddress));
        } else {
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", nodeAddress, _previousBond));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", nodeAddress, _previousBond));
        }
        subUint(nodeKey, 1);
        subUint(numeratorKey, _previousFee);
        // Increment new bond count
        if (_newBond == 16 ether){
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", nodeAddress));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", nodeAddress));
        } else {
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", nodeAddress, _newBond));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", nodeAddress, _newBond));
        }
        addUint(nodeKey, 1);
        addUint(numeratorKey, _newFee);
    }

    /// @dev Increments a node operator's number of staking minipools and calculates updated average node fee.
    ///      Must be called from the minipool itself as msg.sender is used to query the minipool's node fee
    /// @param _nodeAddress The node address to increment the number of staking minipools of
    function incrementNodeStakingMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Get contracts
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        // Try to distribute current fees at previous average commission rate
        _tryDistribute(_nodeAddress);
        // Update the node specific count
        uint256 depositSize = minipool.getNodeDepositBalance();
        bytes32 nodeKey;
        bytes32 numeratorKey;
        if (depositSize == 16 ether){
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress));
        } else {
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress, depositSize));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress, depositSize));
        }
        uint256 nodeValue = getUint(nodeKey);
        setUint(nodeKey, nodeValue + 1);
        // Update the total count
        bytes32 totalKey = keccak256(abi.encodePacked("minipools.staking.count"));
        uint256 totalValue = getUint(totalKey);
        setUint(totalKey, totalValue + 1);
        // Update node fee average
        addUint(numeratorKey, minipool.getNodeFee());
    }

    /// @dev Decrements a node operator's number of minipools in staking status and calculates updated average node fee.
    ///      Must be called from the minipool itself as msg.sender is used to query the minipool's node fee
    /// @param _nodeAddress The node address to decrement the number of staking minipools of
    function decrementNodeStakingMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Get contracts
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        // Try to distribute current fees at previous average commission rate
        _tryDistribute(_nodeAddress);
        // Update the node specific count
        uint256 depositSize = minipool.getNodeDepositBalance();
        bytes32 nodeKey;
        bytes32 numeratorKey;
        if (depositSize == 16 ether){
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress));
        } else {
            nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress, depositSize));
            numeratorKey = keccak256(abi.encodePacked("node.average.fee.numerator", _nodeAddress, depositSize));
        }
        uint256 nodeValue = getUint(nodeKey);
        setUint(nodeKey, nodeValue - 1);
        // Update the total count
        bytes32 totalKey = keccak256(abi.encodePacked("minipools.staking.count"));
        uint256 totalValue = getUint(totalKey);
        setUint(totalKey, totalValue - 1);
        // Update node fee average
        subUint(numeratorKey, minipool.getNodeFee());
    }

    /// @notice Calls distribute on the given node's distributor if it has a balance and has been initialised
    /// @dev Reverts if node has not initialised their distributor
    /// @param _nodeAddress The node operator to try distribute rewards for
    function tryDistribute(address _nodeAddress) override external {
        _tryDistribute(_nodeAddress);
    }

    /// @dev Calls distribute on the given node's distributor if it has a balance and has been initialised
    /// @param _nodeAddress The node operator to try distribute rewards for
    function _tryDistribute(address _nodeAddress) internal {
        // Get contracts
        RocketNodeDistributorFactoryInterface rocketNodeDistributorFactory = RocketNodeDistributorFactoryInterface(getContractAddress("rocketNodeDistributorFactory"));
        address distributorAddress = rocketNodeDistributorFactory.getProxyAddress(_nodeAddress);
        // If there are funds to distribute than call distribute
        if (distributorAddress.balance > 0) {
            // Get contracts
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            // Ensure distributor has been initialised
            require(rocketNodeManager.getFeeDistributorInitialised(_nodeAddress), "Distributor not initialised");
            RocketNodeDistributorInterface distributor = RocketNodeDistributorInterface(distributorAddress);
            distributor.distribute();
        }
    }

    /// @dev Increments a node operator's number of minipools that have been finalised
    /// @param _nodeAddress The node operator to increment finalised minipool count for
    function incrementNodeFinalisedMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Get active minipool count (before increasing finalised count in case of fallback calculation)
        uint256 activeMinipoolCount = getNodeActiveMinipoolCount(_nodeAddress);
        // Can only finalise a minipool once
        bytes32 finalisedKey = keccak256(abi.encodePacked("node.minipools.finalised", msg.sender));
        require(!getBool(finalisedKey), "Minipool has already been finalised");
        setBool(finalisedKey, true);
        // Update the node specific count
        addUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)), 1);
        // Update the total count
        addUint(keccak256(bytes("minipools.finalised.count")), 1);
        // Update ETH matched
        RocketNetworkSnapshots rocketNetworkSnapshots = RocketNetworkSnapshots(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        uint256 ethMatched = rocketNetworkSnapshots.latestValue(key);
        ethMatched -= RocketMinipoolInterface(msg.sender).getUserDepositBalance();
        rocketNetworkSnapshots.push(key, uint224(ethMatched));
        // Decrement active count
        key = keccak256(abi.encodePacked("minipools.active.count", _nodeAddress));
        rocketNetworkSnapshots.push(key, uint224(activeMinipoolCount - 1));
    }

    /// @dev Create a minipool. Only accepts calls from the RocketNodeDeposit contract
    /// @param _nodeAddress The owning node operator's address
    /// @param _salt A salt used in determining the minipool's address
    function createMinipool(address _nodeAddress, uint256 _salt) override public onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) returns (RocketMinipoolInterface) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node minipool limit based on RPL stake
        { // Local scope to prevent stack too deep error
          RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
          // Check global minipool limit
          uint256 totalActiveMinipoolCount = getActiveMinipoolCount();
          require(totalActiveMinipoolCount + 1 <= rocketDAOProtocolSettingsMinipool.getMaximumCount(), "Global minipool limit reached");
        }
        // Get current active minipool count for this node operator (before we insert into address set in case it uses fallback calc)
        uint256 activeMinipoolCount = getNodeActiveMinipoolCount(_nodeAddress);
        // Create minipool contract
        address contractAddress = deployContract(_nodeAddress, _salt);
        // Initialise minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", contractAddress)), true);
        // Add minipool to indexes
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.index")), contractAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), contractAddress);
        // Increment active count
        RocketNetworkSnapshots rocketNetworkSnapshots = RocketNetworkSnapshots(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("minipools.active.count", _nodeAddress));
        rocketNetworkSnapshots.push(key, uint224(activeMinipoolCount + 1));
        // Emit minipool created event
        emit MinipoolCreated(contractAddress, _nodeAddress, block.timestamp);
        // Return created minipool address
        return RocketMinipoolInterface(contractAddress);
    }

    /// @notice Creates a vacant minipool that can be promoted by changing the given validator's withdrawal credentials
    /// @param _nodeAddress Address of the owning node operator
    /// @param _salt A salt used in determining the minipool's address
    /// @param _validatorPubkey A validator pubkey that the node operator intends to migrate the withdrawal credentials of
    /// @param _bondAmount The bond amount selected by the node operator
    /// @param _currentBalance The current balance of the validator on the beaconchain (will be checked by oDAO and scrubbed if not correct)
    function createVacantMinipool(address _nodeAddress, uint256 _salt, bytes calldata _validatorPubkey, uint256 _bondAmount, uint256 _currentBalance) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) returns (RocketMinipoolInterface) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Create the minipool
        RocketMinipoolInterface minipool = createMinipool(_nodeAddress, _salt);
        // Prepare the minipool
        minipool.prepareVacancy(_bondAmount, _currentBalance);
        // Set the minipool's validator pubkey
        _setMinipoolPubkey(address(minipool), _validatorPubkey);
        // Add minipool to the vacant set
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.vacant.index")), address(minipool));
        // Return
        return minipool;
    }

    /// @dev Called by minipool to remove from vacant set on promotion or dissolution
    function removeVacantMinipool() override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Remove from vacant set
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.vacant.index")), msg.sender);
        // If minipool was dissolved, remove mapping of pubkey to minipool to allow NO to try again in future
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        if (minipool.getStatus() == MinipoolStatus.Dissolved) {
            bytes memory pubkey = getMinipoolPubkey(msg.sender);
            deleteAddress(keccak256(abi.encodePacked("validator.minipool", pubkey)));
        }
    }

    /// @notice Returns the number of minipools in the vacant minipool set
    function getVacantMinipoolCount() override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.vacant.index")));
    }

    /// @notice Returns the vacant minipool at a given index
    /// @param _index The index into the vacant minipool set to retrieve
    function getVacantMinipoolAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.vacant.index")), _index);
    }

    /// @dev Destroy a minipool cleaning up all relevant state. Only accepts calls from registered minipools
    function destroyMinipool() override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Initialize minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Update ETH matched
        RocketNetworkSnapshots rocketNetworkSnapshots = RocketNetworkSnapshots(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("eth.matched.node.amount", nodeAddress));
        uint256 ethMatched = uint256(rocketNetworkSnapshots.latestValue(key));
        ethMatched -= minipool.getUserDepositBalance();
        rocketNetworkSnapshots.push(key, uint224(ethMatched));
        // Update minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)), false);
        // Record minipool as destroyed to prevent recreation at same address
        setBool(keccak256(abi.encodePacked("minipool.destroyed", msg.sender)), true);
        // Get number of active minipools (before removing from address set in case of fallback calculation)
        uint256 activeMinipoolCount = getNodeActiveMinipoolCount(nodeAddress);
        // Remove minipool from indexes
        addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.index")), msg.sender);
        addressSetStorage.removeItem(keccak256(abi.encodePacked("node.minipools.index", nodeAddress)), msg.sender);
        // Clean up pubkey state
        bytes memory pubkey = getMinipoolPubkey(msg.sender);
        deleteBytes(keccak256(abi.encodePacked("minipool.pubkey", msg.sender)));
        deleteAddress(keccak256(abi.encodePacked("validator.minipool", pubkey)));
        // Decrement active count
        key = keccak256(abi.encodePacked("minipools.active.count", nodeAddress));
        rocketNetworkSnapshots.push(key, uint224(activeMinipoolCount - 1));
        // Emit minipool destroyed event
        emit MinipoolDestroyed(msg.sender, nodeAddress, block.timestamp);
    }

    /// @dev Set a minipool's validator pubkey. Only accepts calls from registered minipools
    /// @param _pubkey The pubkey to set for the calling minipool
    function setMinipoolPubkey(bytes calldata _pubkey) override public onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        _setMinipoolPubkey(msg.sender, _pubkey);
    }

    /// @dev Internal logic to set a minipool's pubkey, reverts if pubkey already set
    /// @param _pubkey The pubkey to set for the calling minipool
    function _setMinipoolPubkey(address _minipool, bytes calldata _pubkey) private {
        // Check validator pubkey is not in use
        require(getMinipoolByPubkey(_pubkey) == address(0x0), "Validator pubkey is in use");
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Initialise minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        address nodeAddress = minipool.getNodeAddress();
        // Set minipool validator pubkey & validator minipool address
        setBytes(keccak256(abi.encodePacked("minipool.pubkey", _minipool)), _pubkey);
        setAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)), _minipool);
        // Add minipool to node validating minipools index
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.validating.index", nodeAddress)), _minipool);
    }

    /// @dev Wrapper around minipool getDepositType which handles backwards compatibility with v1 and v2 delegates
    /// @param _minipoolAddress Minipool address to get the deposit type of
    function getMinipoolDepositType(address _minipoolAddress) external override view returns (MinipoolDeposit) {
        RocketMinipoolInterface minipoolInterface = RocketMinipoolInterface(_minipoolAddress);
        uint8 version = 1;

        // Version 1 minipools did not have a version() function
        try minipoolInterface.version() returns (uint8 tryVersion) {
            version = tryVersion;
        } catch (bytes memory /*lowLevelData*/) {}

        if (version == 1 || version == 2) {
            try minipoolInterface.getDepositType{gas: 30000}() returns (MinipoolDeposit depositType) {
                return depositType;
            } catch (bytes memory /*lowLevelData*/) {
                return MinipoolDeposit.Variable;
            }
        }

        return minipoolInterface.getDepositType();
    }

    /// @dev Performs a CREATE2 deployment of a minipool contract with given salt
    /// @param _nodeAddress The owning node operator's address
    /// @param _salt A salt used in determining the minipool's address
    function deployContract(address _nodeAddress, uint256 _salt) private returns (address) {
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        return rocketMinipoolFactory.deployContract(_nodeAddress, _salt);
    }
}
