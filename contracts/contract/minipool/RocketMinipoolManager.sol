pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";

// Minipool creation, removal and management

contract RocketMinipoolManager is RocketBase, RocketMinipoolManagerInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event MinipoolCreated(address indexed minipool, address indexed node, uint256 time);
    event MinipoolDestroyed(address indexed minipool, address indexed node, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the number of minipools in the network
    function getMinipoolCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.index")));
    }

    // Get a network minipool address by index
    function getMinipoolAt(uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.index")), _index);
    }

    // Get the number of minipools owned by a node
    function getNodeMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)));
    }

    // Get a node minipool address by index
    function getNodeMinipoolAt(address _nodeAddress, uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), _index);
    }

    // Get the number of validating minipools owned by a node
    function getNodeValidatingMinipoolCount(address _nodeAddress) override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)));
    }

    // Get a validating node minipool address by index
    function getNodeValidatingMinipoolAt(address _nodeAddress, uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("node.minipools.validating.index", _nodeAddress)), _index);
    }

    // Get a minipool address by validator pubkey
    function getMinipoolByPubkey(bytes memory _pubkey) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked("validator.minipool", _pubkey)));
    }

    // Check whether a minipool exists
    function getMinipoolExists(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress)));
    }

    // Get a minipool's validator pubkey
    function getMinipoolPubkey(address _minipoolAddress) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked("minipool.pubkey", _minipoolAddress)));
    }

    // Get a minipool's total balance at withdrawal
    function getMinipoolWithdrawalTotalBalance(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.total", _minipoolAddress)));
    }

    // Get a minipool's node balance at withdrawal
    function getMinipoolWithdrawalNodeBalance(address _minipoolAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.node", _minipoolAddress)));
    }

    // Get a minipool's withdrawable status
    function getMinipoolWithdrawable(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.withdrawable", _minipoolAddress)));
    }

    // Get a minipool's withdrawal processed status
    function getMinipoolWithdrawalProcessed(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.withdrawal.processed", _minipoolAddress)));
    }

    // Create a minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function createMinipool(address _nodeAddress, MinipoolDeposit _depositType) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) returns (RocketMinipoolInterface) {
        // Load contracts
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node minipool limit based on RPL stake
        require(
            addressSetStorage.getCount(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress))) < rocketNodeStaking.getNodeMinipoolLimit(_nodeAddress),
            "Minipool count after deposit exceeds limit based on node RPL stake"
        );
        { // Local scope to prevent stack too deep error
          RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
          // Check global minipool limit
          uint256 totalMinipoolCount = getMinipoolCount();
          require(totalMinipoolCount.add(1) <= rocketDAOProtocolSettingsMinipool.getMaximumCount(), "Global minipool limit reached");
        }
        // Create minipool contract
        RocketMinipoolInterface minipool = RocketMinipoolInterface(rocketMinipoolFactory.createMinipool(_nodeAddress, _depositType));
        address contractAddress = address(minipool);
        // Get current minipool count
        uint256 minipoolCount = getNodeMinipoolCount(_nodeAddress);
        // Initialize minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", contractAddress)), true);
        // Add minipool to indexes
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.index")), contractAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), contractAddress);
        // Update unbonded validator count if minipool is unbonded
        if (_depositType == MinipoolDeposit.Empty) { rocketDAONodeTrusted.incrementMemberUnbondedValidatorCount(_nodeAddress); }
        { // This scope is to prevent a stack too deep error
            // Prevent creation of minipools between price update block and price consensus
            RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
            require(rocketNetworkPrices.inConsensus(), "Cannot create a minipool while network is reaching consensus");
        }
        // Update total effective RPL stake
        updateTotalEffectiveRPLStake(_nodeAddress, minipoolCount, minipoolCount.add(1));
        // Emit minipool created event
        emit MinipoolCreated(contractAddress, _nodeAddress, block.timestamp);
        // Add minipool to queue
        RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue")).enqueueMinipool(_depositType, contractAddress);
        // Return created minipool address
        return minipool;
    }

    // Destroy a minipool
    // Only accepts calls from registered minipools
    function destroyMinipool() override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Initialize minipool & get properties
        RocketMinipoolInterface minipool = RocketMinipoolInterface(msg.sender);
        address nodeAddress = minipool.getNodeAddress();
        // Get current minipool count
        uint256 minipoolCount = getNodeMinipoolCount(nodeAddress);
        // Update minipool data
        setBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)), false);
        // Remove minipool from indexes
        addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.index")), msg.sender);
        addressSetStorage.removeItem(keccak256(abi.encodePacked("node.minipools.index", nodeAddress)), msg.sender);
        // Update unbonded validator count if minipool is unbonded
        if (minipool.getDepositType() == MinipoolDeposit.Empty) { rocketDAONodeTrusted.decrementMemberUnbondedValidatorCount(nodeAddress); }
        // Prevent destroying minipools between price update block and price consensus
        require(rocketNetworkPrices.inConsensus(), "Cannot destroy a minipool while network is reaching consensus");
        // Update total effective RPL stake
        updateTotalEffectiveRPLStake(msg.sender, minipoolCount, minipoolCount.sub(1));
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
        // Get the node's current stake balance
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

    // Set a minipool's withdrawal balances and withdrawable status
    // Only accepts calls from the RocketMinipoolStatus contract
    function setMinipoolWithdrawalBalances(address _minipoolAddress, uint256 _total, uint256 _node) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        setUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.total", _minipoolAddress)), _total);
        setUint(keccak256(abi.encodePacked("minipool.withdrawal.balance.node", _minipoolAddress)), _node);
        setBool(keccak256(abi.encodePacked("minipool.withdrawable", _minipoolAddress)), true);
    }

    // Set a minipool's withdrawal processed status
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function setMinipoolWithdrawalProcessed(address _minipoolAddress) override external onlyLatestContract("rocketMinipoolManager", address(this)) onlyLatestContract("rocketNetworkWithdrawal", msg.sender) {
        setBool(keccak256(abi.encodePacked("minipool.withdrawal.processed", _minipoolAddress)), true);
    }

}
