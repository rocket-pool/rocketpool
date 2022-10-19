pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

import "../minipool/RocketMinipoolManager.sol";
import "../node/RocketNodeManager.sol";
import "../node/RocketNodeDistributorFactory.sol";
import "../node/RocketNodeDistributorDelegate.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

contract RocketUpgradeOneDotTwo is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the setup method has been called
    bool public setup;

    // Upgrade contracts
    address public newRocketNodeDeposit;
    address public newRocketMinipoolDelegate;
    address public newRocketDAOProtocolSettingsMinipool;
    address public newRocketMinipoolQueue;
    address public newRocketDepositPool;
    address public newRocketDAOProtocolSettingsDeposit;
    address public newRocketMinipoolManager;
    address public newRocketNodeStaking;
    address public newRocketNodeDistributorDelegate;
    address public newRocketMinipoolFactory;

    // Upgrade ABIs
    string public newRocketNodeDepositAbi;
    string public newRocketMinipoolDelegateAbi;
    string public newRocketDAOProtocolSettingsMinipoolAbi;
    string public newRocketMinipoolQueueAbi;
    string public newRocketDepositPoolAbi;
    string public newRocketDAOProtocolSettingsDepositAbi;
    string public newRocketMinipoolManagerAbi;
    string public newRocketNodeStakingAbi;
    string public newRocketNodeDistributorDelegateAbi;
    string public newRocketMinipoolFactoryAbi;

    // Merkle root for balances migration
    bytes32 public migrationBalancesMerkleRoot;

    // Save deployer to limit access to set functions
    address immutable deployer;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        deployer = msg.sender;
    }

    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    function setMigrationBalancesRoot(bytes32 _root) external {
        require(msg.sender == deployer, "Only deployer can set");
        require(!setup, "Already setup");

        migrationBalancesMerkleRoot = _root;
    }

    function set(address[] memory _addresses, string[] memory _abis) external {
        require(msg.sender == deployer, "Only deployer can set");
        require(!setup, "Already setup");

        // Set contract addresses
        newRocketNodeDeposit = _addresses[0];
        newRocketMinipoolDelegate = _addresses[1];
        newRocketDAOProtocolSettingsMinipool = _addresses[2];
        newRocketMinipoolQueue = _addresses[3];
        newRocketDepositPool = _addresses[4];
        newRocketDAOProtocolSettingsDeposit = _addresses[5];
        newRocketMinipoolManager = _addresses[6];
        newRocketNodeStaking = _addresses[7];
        newRocketNodeDistributorDelegate = _addresses[8];
        newRocketMinipoolFactory = _addresses[9];

        // Set ABIs
        newRocketNodeDepositAbi = _abis[0];
        newRocketMinipoolDelegateAbi = _abis[1];
        newRocketDAOProtocolSettingsMinipoolAbi = _abis[2];
        newRocketMinipoolQueueAbi = _abis[3];
        newRocketDepositPoolAbi = _abis[4];
        newRocketDAOProtocolSettingsDepositAbi = _abis[5];
        newRocketMinipoolManagerAbi = _abis[6];
        newRocketNodeStakingAbi = _abis[7];
        newRocketNodeDistributorDelegateAbi = _abis[8];
        newRocketMinipoolFactoryAbi = _abis[9];
    }

    // Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");

        // Upgrade contracts
        _upgradeContract("rocketNodeDeposit", newRocketNodeDeposit, newRocketNodeDepositAbi);
        _upgradeContract("rocketMinipoolDelegate", newRocketMinipoolDelegate, newRocketMinipoolDelegateAbi);
        _upgradeContract("rocketDAOProtocolSettingsMinipool", newRocketDAOProtocolSettingsMinipool, newRocketDAOProtocolSettingsMinipoolAbi);
        _upgradeContract("rocketMinipoolQueue", newRocketMinipoolQueue, newRocketMinipoolQueueAbi);
        _upgradeContract("rocketDepositPool", newRocketDepositPool, newRocketDepositPoolAbi);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", newRocketDAOProtocolSettingsDeposit, newRocketDAOProtocolSettingsDepositAbi);
        _upgradeContract("rocketMinipoolManager", newRocketMinipoolManager, newRocketMinipoolManagerAbi);
        _upgradeContract("rocketNodeStaking", newRocketNodeStaking, newRocketNodeStakingAbi);
        _upgradeContract("rocketNodeDistributorDelegate", newRocketNodeDistributorDelegate, newRocketNodeDistributorDelegateAbi);
        _upgradeContract("rocketMinipoolFactory", newRocketMinipoolFactory, newRocketMinipoolFactoryAbi);

        // Add new contracts

        // Migrate settings
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "deposit"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.assign.maximum")), 90);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.assign.socialised.maximum")), 2);

        // Delete deprecated storage items
        deleteUint(keccak256("network.rpl.stake"));
        deleteUint(keccak256("network.rpl.stake.updated.block"));

        // Update node fee to 14%
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.fee.minimum")), 0.14 ether);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.fee.target")), 0.14 ether);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.fee.maximum")), 0.14 ether);

        // Merkle root for minipool migration
        setBytes32(keccak256(abi.encodePacked('migration.balances.merkle.root')), migrationBalancesMerkleRoot);

        // Complete
        executed = true;
    }

    // Add a new network contract
    function _addContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract name
        require(bytes(_name).length > 0, "Invalid contract name");
        // Cannot add contract if it already exists (use upgradeContract instead)
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0), "Contract name is already in use");
        // Cannot add contract if already in use as ABI only
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length == 0, "Contract name is already in use");
        // Check contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))), "Contract address is already in use");
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        // Register contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
    }

    // Upgrade a network contract
    function _upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Get old contract address & check contract exists
        address oldContractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        require(oldContractAddress != address(0x0), "Contract does not exist");
        // Check new contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(_contractAddress != oldContractAddress, "The contract address cannot be set to its current address");
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))), "Contract address is already in use");
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        // Register new contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Deregister old contract
        deleteString(keccak256(abi.encodePacked("contract.name", oldContractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", oldContractAddress)));
    }

    // Deletes a network contract
    function _deleteContract(string memory _name) internal {
        address contractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.name", contractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", contractAddress)));
        deleteAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.abi", _name)));
    }
}