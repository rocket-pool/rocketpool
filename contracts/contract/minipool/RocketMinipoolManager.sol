pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../types/MinipoolStatus.sol";
import "../../types/MinipoolDeposit.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event MinipoolCreated(address indexed minipool, address indexed node, uint256 time);
    event MinipoolDestroyed(address indexed minipool, address indexed node, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    // Get the number of minipools in the network
    function getMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(bytes("minipools.index")));
    }

    // Get the number of minipools in the network in the Staking state
    function getStakingMinipoolCount() override external view returns (uint256) {
        return getUint(keccak256(bytes("minipools.staking.count")));
    }

    // Get the number of finalised minipools in the network
    function getFinalisedMinipoolCount() override external view returns (uint256) {
        return getUint(keccak256(bytes("minipools.finalised.count")));
    }

    // Get the number of active minipools in the network
    function getActiveMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        uint256 total = addressSetStorage.getCount(keccak256(bytes("minipools.index")));
        uint256 finalised = getUint(keccak256(bytes("minipools.finalised.count")));
        return total.sub(finalised);
    }

    // Get the number of minipools in each status.
    // Returns the counts for Initialised, Prelaunch, Staking, Withdrawable, and Dissolved in that order.
    function getMinipoolCountPerStatus(uint256 offset, uint256 limit) override external view 
    returns (uint256 initialisedCount, uint256 prelaunchCount, uint256 stakingCount, uint256 withdrawableCount, uint256 dissolvedCount) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute minipool key
        bytes32 minipoolKey = keccak256(abi.encodePacked("minipools.index"));
        // Iterate over the requested minipool range
        uint256 totalMinipools = getMinipoolCount();
        uint256 max = offset.add(limit);
        if (max > totalMinipools || limit == 0) { max = totalMinipools; }
        for (uint256 i = offset; i < max; i++) {
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

    // Returns an array of all minipools in the prelaunch state
    function getPrelaunchMinipools(uint256 offset, uint256 limit) override external view
    returns (address[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute minipool key
        bytes32 minipoolKey = keccak256(abi.encodePacked("minipools.index"));
        // Iterate over the requested minipool range
        uint256 totalMinipools = getMinipoolCount();
        uint256 max = offset.add(limit);
        if (max > totalMinipools || limit == 0) { max = totalMinipools; }
        // Create array big enough for every minipool
        address[] memory minipools = new address[](max.sub(offset));
        uint256 total = 0;
        for (uint256 i = offset; i < max; i++) {
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

    // Get a network minipool address by index
    function getMinipoolAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.index")), _index);
    }

    // Get the number of minipools owned by a node
    function getNodeMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
    }

    // Get the number of minipools owned by a node that are not finalised
    function getNodeActiveMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        uint256 finalised = getUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)));
        uint256 total = addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
        return total.sub(finalised);
    }

    // Get the number of minipools owned by a node that are finalised
    function getNodeFinalisedMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)));
    }

    // Get the number of minipools owned by a node that are in staking status
    function getNodeStakingMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress)));
    }

    // Get a node minipool address by index
    function getNodeMinipoolAt(address _nodeAddress, uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), _index);
    }

    // Get the number of validating minipools owned by a node
    function getNodeValidatingMinipoolCount(address _nodeAddress) override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)));
    }

    // Get a validating node minipool address by index
    function getNodeValidatingMinipoolAt(address _nodeAddress, uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)), _index);
    }

    // Get a minipool address by validator pubkey
    function getMinipoolByPubkey(bytes memory _pubkey) override external view returns (address) {
        return getAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)));
    }

    // Check whether a minipool exists
    function getMinipoolExists(address _minipoolAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress)));
    }

    // Check whether a minipool previously existed at the given address
    function getMinipoolDestroyed(address _minipoolAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.destroyed", _minipoolAddress)));
    }

    // Get a minipool's validator pubkey
    function getMinipoolPubkey(address _minipoolAddress) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked("minipool.pubkey", _minipoolAddress)));
    }

    // Get the withdrawal credentials for the minipool contract
    function getMinipoolWithdrawalCredentials(address _minipoolAddress) override public pure returns (bytes memory) {
        return abi.encodePacked(byte(0x01), bytes11(0x0), address(_minipoolAddress));
    }

    // Increments _nodeAddress' number of minipools in staking status
    function incrementNodeStakingMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        // Update the node specific count
        bytes32 nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress));
        uint256 nodeValue = getUint(nodeKey);
        setUint(nodeKey, nodeValue.add(1));
        // Update the total count
        bytes32 totalKey = keccak256(abi.encodePacked("minipools.staking.count"));
        uint256 totalValue = getUint(totalKey);
        setUint(totalKey, totalValue.add(1));
        // Update total effective stake
        updateTotalEffectiveRPLStake(_nodeAddress, nodeValue, nodeValue.add(1));
        // Update node fee average
        rocketNodeManager.increaseAverageNodeFeeNumerator(_nodeAddress, minipool.getNodeFee());
    }

    // Decrements _nodeAddress' number of minipools in staking status
    function decrementNodeStakingMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        // Update the node specific count
        bytes32 nodeKey = keccak256(abi.encodePacked("node.minipools.staking.count", _nodeAddress));
        uint256 nodeValue = getUint(nodeKey);
        setUint(nodeKey, nodeValue.sub(1));
        // Update the total count
        bytes32 totalKey = keccak256(abi.encodePacked("minipools.staking.count"));
        uint256 totalValue = getUint(totalKey);
        setUint(totalKey, totalValue.sub(1));
        // Update total effective stake
        updateTotalEffectiveRPLStake(_nodeAddress, nodeValue, nodeValue.sub(1));
        // Update node fee average
        rocketNodeManager.decreaseAverageNodeFeeNumerator(_nodeAddress, minipool.getNodeFee());
    }

    // Increments _nodeAddress' number of minipools that have been finalised
    function incrementNodeFinalisedMinipoolCount(address _nodeAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Update the node specific count
        addUint(keccak256(abi.encodePacked("node.minipools.finalised.count", _nodeAddress)), 1);
        // Update the total count
        addUint(keccak256(bytes("minipools.finalised.count")), 1);
    }

    // Create a minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function createMinipool(address _nodeAddress, MinipoolDeposit _depositType, uint256 _salt) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) returns (RocketMinipoolInterface) {
        // Load contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node minipool limit based on RPL stake
        require(
            getNodeActiveMinipoolCount(_nodeAddress) < rocketNodeStaking.getNodeMinipoolLimit(_nodeAddress),
            "Minipool count after deposit exceeds limit based on node RPL stake"
        );
        { // Local scope to prevent stack too deep error
          RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
          // Check global minipool limit
          uint256 totalMinipoolCount = getActiveMinipoolCount();
          require(totalMinipoolCount.add(1) <= rocketDAOProtocolSettingsMinipool.getMaximumCount(), "Global minipool limit reached");
        }
        // Create minipool contract
        address contractAddress = deployContract(_nodeAddress, _depositType, _salt);
        // Initialize minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", contractAddress)), true);
        // Add minipool to indexes
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.index")), contractAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), contractAddress);
        // Update unbonded validator count if minipool is unbonded
        if (_depositType == MinipoolDeposit.Empty) {
            RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
            rocketDAONodeTrusted.incrementMemberUnbondedValidatorCount(_nodeAddress);
        }
        // Emit minipool created event
        emit MinipoolCreated(contractAddress, _nodeAddress, block.timestamp);
        // Add minipool to queue
        RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue")).enqueueMinipool(_depositType, contractAddress);
        // Return created minipool address
        return RocketMinipoolInterface(contractAddress);
    }

    // Destroy a minipool
    // Only accepts calls from registered minipools
    function destroyMinipool() override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Initialize minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Update minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)), false);
        // Record minipool as destroyed to prevent recreation at same address
        setBool(keccak256(abi.encodePacked("minipool.destroyed", msg.sender)), true);
        // Remove minipool from indexes
        addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.index")), msg.sender);
        addressSetStorage.removeItem(keccak256(abi.encodePacked("node.minipools.index", nodeAddress)), msg.sender);
        // Clean up pubkey state
        bytes memory pubkey = getMinipoolPubkey(msg.sender);
        deleteBytes(keccak256(abi.encodePacked("minipool.pubkey", msg.sender)));
        deleteAddress(keccak256(abi.encodePacked("validator.minipool", pubkey)));
        // Emit minipool destroyed event
        emit MinipoolDestroyed(msg.sender, nodeAddress, block.timestamp);
    }

    // Updates the stored total effective rate based on a node's changing minipool count
    function updateTotalEffectiveRPLStake(address _nodeAddress, uint256 _oldCount, uint256 _newCount) private {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        // Require price consensus
        require(rocketNetworkPrices.inConsensus(), "Network is not in consensus");
        // Get node's RPL stake
        uint256 rplStake = rocketNodeStaking.getNodeRPLStake(_nodeAddress);
        // Get the node's maximum possible stake
        uint256 maxRplStakePerMinipool = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake());
        uint256 oldMaxRplStake = maxRplStakePerMinipool
            .mul(_oldCount)
            .div(rocketNetworkPrices.getRPLPrice());
        uint256 newMaxRplStake = maxRplStakePerMinipool
            .mul(_newCount)
            .div(rocketNetworkPrices.getRPLPrice());
        // Check if we have to decrease total
        if (_oldCount > _newCount) {
            if (rplStake <= newMaxRplStake) {
                return;
            }
            uint256 decrease = oldMaxRplStake.sub(newMaxRplStake);
            uint256 delta = rplStake.sub(newMaxRplStake);
            if (delta > decrease) { delta = decrease; }
            rocketNetworkPrices.decreaseEffectiveRPLStake(delta);
            return;
        }
        // Check if we have to increase total
        if (_newCount > _oldCount) {
            if (rplStake <= oldMaxRplStake) {
                return;
            }
            uint256 increase = newMaxRplStake.sub(oldMaxRplStake);
            uint256 delta = rplStake.sub(oldMaxRplStake);
            if (delta > increase) { delta = increase; }
            rocketNetworkPrices.increaseEffectiveRPLStake(delta);
            return;
        }
        // _oldCount == _newCount (do nothing but shouldn't happen)
    }

    // Set a minipool's validator pubkey
    // Only accepts calls from registered minipools
    function setMinipoolPubkey(bytes calldata _pubkey) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Initialize minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Set minipool validator pubkey & validator minipool address
        setBytes(keccak256(abi.encodePacked("minipool.pubkey", msg.sender)), _pubkey);
        setAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)), msg.sender);
        // Add minipool to node validating minipools index
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.validating.index", nodeAddress)), msg.sender);
    }

    // Performs a CREATE2 deployment of a minipool contract with given salt
    function deployContract(address _nodeAddress, MinipoolDeposit _depositType, uint256 _salt) private returns (address) {
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        return rocketMinipoolFactory.deployContract(_nodeAddress, _depositType, _salt);
    }
}
