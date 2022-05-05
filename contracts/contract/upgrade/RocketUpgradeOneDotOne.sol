pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

import "../minipool/RocketMinipoolManager.sol";
import "../node/RocketNodeManager.sol";
import "../node/RocketNodeDistributorFactory.sol";
import "../node/RocketNodeDistributorDelegate.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

contract RocketUpgradeOneDotOne is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the setup method has been called
    bool public setup;

    address public newRocketMinipoolManager;
    address public newRocketNodeManager;
    address public newRocketNodeDeposit;
    address public newRocketDAOProtocolSettingsNetwork;
    address public rocketNodeDistributorFactory;
    address public rocketNodeDistributorDelegate;
    address public newRocketRewardsPool;
    address public newRocketNodeStaking;
    address public rocketMerkleDistributorMainnet;
    address public rocketDAONodeTrustedSettingsRewards;
    address public rocketSmoothingPool;
    address public rocketMinipoolFactory;
    address public newRocketDAOProtocolSettingsNode;

    string public newRocketMinipoolManagerAbi;
    string public newRocketNodeManagerAbi;
    string public newRocketNodeDepositAbi;
    string public newRocketDAOProtocolSettingsNetworkAbi;
    string public rocketNodeDistributorFactoryAbi;
    string public rocketNodeDistributorDelegateAbi;
    string public newRocketRewardsPoolAbi;
    string public newRocketNodeStakingAbi;
    string public rocketMerkleDistributorMainnetAbi;
    string public rocketDAONodeTrustedSettingsRewardsAbi;
    string public rocketSmoothingPoolAbi;
    string public rocketMinipoolFactoryAbi;
    string public newRocketDAOProtocolSettingsNodeAbi;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    function set(address[13] memory _addresses, string[13] memory _abis) external {
        require(!setup, "Already setup");
        setup = true;

        // Set contract addresses
        newRocketMinipoolManager = _addresses[0];
        newRocketNodeManager = _addresses[1];
        newRocketNodeDeposit = _addresses[2];
        newRocketDAOProtocolSettingsNetwork = _addresses[3];
        rocketNodeDistributorFactory = _addresses[4];
        rocketNodeDistributorDelegate = _addresses[5];
        newRocketRewardsPool = _addresses[6];
        newRocketNodeStaking = _addresses[7];
        rocketMerkleDistributorMainnet = _addresses[8];
        rocketDAONodeTrustedSettingsRewards = _addresses[9];
        rocketSmoothingPool = _addresses[10];
        rocketMinipoolFactory = _addresses[11];
        newRocketDAOProtocolSettingsNode = _addresses[12];

        // Set ABIs
        newRocketMinipoolManagerAbi = _abis[0];
        newRocketNodeManagerAbi = _abis[1];
        newRocketNodeDepositAbi = _abis[2];
        newRocketDAOProtocolSettingsNetworkAbi = _abis[3];
        rocketNodeDistributorFactoryAbi = _abis[4];
        rocketNodeDistributorDelegateAbi = _abis[5];
        newRocketRewardsPoolAbi = _abis[6];
        newRocketNodeStakingAbi = _abis[7];
        rocketMerkleDistributorMainnetAbi = _abis[8];
        rocketDAONodeTrustedSettingsRewardsAbi = _abis[9];
        rocketSmoothingPoolAbi = _abis[10];
        rocketMinipoolFactoryAbi = _abis[11];
        newRocketDAOProtocolSettingsNodeAbi = _abis[12];
    }

    // Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");

        // Delete contract no longer in use
        _deleteContract("rocketClaimNode");
        _deleteContract("rocketClaimTrustedNode");

        // Upgrade contracts
        _upgradeContract("rocketMinipoolManager", newRocketMinipoolManager, newRocketMinipoolManagerAbi);
        _upgradeContract("rocketNodeManager", newRocketNodeManager, newRocketNodeManagerAbi);
        _upgradeContract("rocketNodeDeposit", newRocketNodeDeposit, newRocketNodeDepositAbi);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", newRocketDAOProtocolSettingsNetwork, newRocketDAOProtocolSettingsNetworkAbi);
        _upgradeContract("rocketRewardsPool", newRocketRewardsPool, newRocketRewardsPoolAbi);
        _upgradeContract("rocketNodeStaking", newRocketNodeStaking, newRocketNodeStakingAbi);
        _upgradeContract("rocketDAOProtocolSettingsNode", newRocketDAOProtocolSettingsNode, newRocketDAOProtocolSettingsNodeAbi);

        // Add new contracts
        _addContract("rocketNodeDistributorFactory", rocketNodeDistributorFactory, rocketNodeDistributorFactoryAbi);
        _addContract("rocketNodeDistributorDelegate", rocketNodeDistributorDelegate, rocketNodeDistributorDelegateAbi);
        _addContract("rocketMerkleDistributorMainnet", rocketMerkleDistributorMainnet, rocketMerkleDistributorMainnetAbi);
        _addContract("rocketDAONodeTrustedSettingsRewards", rocketDAONodeTrustedSettingsRewards, rocketDAONodeTrustedSettingsRewardsAbi);
        _addContract("rocketSmoothingPool", rocketSmoothingPool, rocketSmoothingPoolAbi);
        _addContract("rocketMinipoolFactory", rocketMinipoolFactory, rocketMinipoolFactoryAbi);

        // Migrate settings
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.penalty.threshold")), 0.51 ether);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.penalty.per.rate")), 0.1 ether);
        RocketDAONodeTrustedSettingsRewardsInterface rewardsSettings = RocketDAONodeTrustedSettingsRewardsInterface(rocketDAONodeTrustedSettingsRewards);
        rewardsSettings.initialise();
        setAddress(keccak256(abi.encodePacked("rewards.relay.address", uint256(0))), rocketMerkleDistributorMainnet);

        // Complete
        executed = true;
    }

    // Add a new network contract
    function _addContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract name
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
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
        // Check contract being upgraded
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
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

    function _deleteContract(string memory _name) internal {
        address contractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.name", contractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", contractAddress)));
        deleteAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.abi", _name)));
    }
}
