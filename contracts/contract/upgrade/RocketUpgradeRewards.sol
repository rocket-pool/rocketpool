pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsRewardsInterface.sol";

contract RocketUpgradeRewards is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    address public newRocketRewardsPool;
    address public newRocketNodeManager;
    address public newRocketNodeStaking;
    address public rocketMerkleDistributorMainnet;
    address public rocketDAONodeTrustedSettingsRewards;

    string public newRocketRewardsPoolAbi;
    string public newRocketNodeManagerAbi;
    string public newRocketNodeStakingAbi;
    string public rocketMerkleDistributorMainnetAbi;
    string public rocketDAONodeTrustedSettingsRewardsAbi;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        address _newRocketRewardsPool,
        address _newRocketNodeManager,
        address _newRocketNodeStaking,
        address _rocketMerkleDistributorMainnet,
        address _rocketDAONodeTrustedSettingsRewards,
        string memory _newRocketRewardsPoolAbi,
        string memory _newRocketNodeManagerAbi,
        string memory _newRocketNodeStakingAbi,
        string memory _rocketMerkleDistributorMainnetAbi,
        string memory _rocketDAONodeTrustedSettingsRewardsAbi
        ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;

        // Set contract addresses
        newRocketRewardsPool = _newRocketRewardsPool;
        newRocketNodeManager = _newRocketNodeManager;
        newRocketNodeStaking = _newRocketNodeStaking;
        rocketMerkleDistributorMainnet = _rocketMerkleDistributorMainnet;
        rocketDAONodeTrustedSettingsRewards = _rocketDAONodeTrustedSettingsRewards;

        // Set ABIs
        newRocketRewardsPoolAbi = _newRocketRewardsPoolAbi;
        newRocketNodeManagerAbi = _newRocketNodeManagerAbi;
        newRocketNodeStakingAbi = _newRocketNodeStakingAbi;
        rocketMerkleDistributorMainnetAbi = _rocketMerkleDistributorMainnetAbi;
        rocketDAONodeTrustedSettingsRewardsAbi = _rocketDAONodeTrustedSettingsRewardsAbi;
    }

    // Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");
        // Delete contract no longer in use
        _deleteContract("rocketClaimNode");
        _deleteContract("rocketClaimTrustedNode");
        // Upgrade contracts
        _upgradeContract("rocketRewardsPool", newRocketRewardsPool, newRocketRewardsPoolAbi);
        _upgradeContract("rocketNodeManager", newRocketNodeManager, newRocketNodeManagerAbi);
        _upgradeContract("rocketNodeStaking", newRocketNodeStaking, newRocketNodeStakingAbi);
        // Add new contracts
        _addContract("rocketMerkleDistributorMainnet", rocketMerkleDistributorMainnet, rocketMerkleDistributorMainnetAbi);
        _addContract("rocketDAONodeTrustedSettingsRewards", rocketDAONodeTrustedSettingsRewards, rocketDAONodeTrustedSettingsRewardsAbi);
        // Migrate settings
        RocketDAONodeTrustedSettingsRewardsInterface rewardsSettings = RocketDAONodeTrustedSettingsRewardsInterface(rocketDAONodeTrustedSettingsRewards);
        rewardsSettings.initialise();
        // Setup mainnet relay address
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