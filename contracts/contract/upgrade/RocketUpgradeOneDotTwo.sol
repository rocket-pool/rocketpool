// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "../RocketBase.sol";

import "../minipool/RocketMinipoolManager.sol";
import "../node/RocketNodeManager.sol";
import "../node/RocketNodeDistributorFactory.sol";
import "../node/RocketNodeDistributorDelegate.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

/// @notice Transient contract to upgrade Rocket Pool with the Atlas set of contract upgrades
contract RocketUpgradeOneDotTwo is RocketBase {

    struct ClaimInterval {
        uint256 interval;
        uint256 block;
    }

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the contract is locked to further changes
    bool public locked;

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
    address public newRocketNetworkFees;
    address public newRocketNetworkPrices;
    address public newRocketDAONodeTrustedSettingsMinipool;
    address public newRocketNodeManager;
    address public newRocketDAOProtocolSettingsNode;
    address public rocketMinipoolBase;
    address public rocketMinipoolBondReducer;

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
    string public newRocketNetworkFeesAbi;
    string public newRocketNetworkPricesAbi;
    string public newRocketDAONodeTrustedSettingsMinipoolAbi;
    string public newRocketNodeManagerAbi;
    string public newRocketDAOProtocolSettingsNodeAbi;
    string public rocketMinipoolBaseAbi;
    string public rocketMinipoolBondReducerAbi;

    string public newRocketMinipoolAbi;

    // Save deployer to limit access to set functions
    address immutable deployer;

    // Claim intervals
    ClaimInterval[] intervals;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        deployer = msg.sender;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    function set(address[] memory _addresses, string[] memory _abis) external {
        require(msg.sender == deployer, "Only deployer");
        require(!locked, "Contract locked");

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
        newRocketNetworkFees = _addresses[10];
        newRocketNetworkPrices = _addresses[11];
        newRocketDAONodeTrustedSettingsMinipool = _addresses[12];
        newRocketNodeManager = _addresses[13];
        newRocketDAOProtocolSettingsNode = _addresses[14];
        rocketMinipoolBase = _addresses[15];
        rocketMinipoolBondReducer = _addresses[16];

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
        newRocketNetworkFeesAbi = _abis[10];
        newRocketNetworkPricesAbi = _abis[11];
        newRocketDAONodeTrustedSettingsMinipoolAbi = _abis[12];
        newRocketNodeManagerAbi = _abis[13];
        newRocketDAOProtocolSettingsNodeAbi = _abis[14];
        rocketMinipoolBaseAbi = _abis[15];
        rocketMinipoolBondReducerAbi = _abis[16];

        newRocketMinipoolAbi = _abis[17];
    }

    function setInterval(uint256 _interval, uint256 _block) external {
        require(msg.sender == deployer, "Only deployer");
        require(!locked, "Contract locked");

        intervals.push(ClaimInterval({
            interval: _interval,
            block: _block
        }));
    }

    /// @notice Prevents further changes from being applied
    function lock() external {
        require(msg.sender == deployer, "Only deployer");
        locked = true;
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");
        executed = true;

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
        _upgradeContract("rocketNetworkFees", newRocketNetworkFees, newRocketNetworkFeesAbi);
        _upgradeContract("rocketNetworkPrices", newRocketNetworkPrices, newRocketNetworkPricesAbi);
        _upgradeContract("rocketDAONodeTrustedSettingsMinipool", newRocketDAONodeTrustedSettingsMinipool, newRocketDAONodeTrustedSettingsMinipoolAbi);
        _upgradeContract("rocketNodeManager", newRocketNodeManager, newRocketNodeManagerAbi);

        // Add new contracts
        _addContract("rocketMinipoolBase", rocketMinipoolBase, rocketMinipoolBaseAbi);
        _addContract("rocketMinipoolBondReducer", rocketMinipoolBondReducer, rocketMinipoolBondReducerAbi);

        // Upgrade ABIs
        _upgradeABI("rocketMinipool", newRocketMinipoolAbi);

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

        // Set new settings
        settingNameSpace = keccak256(abi.encodePacked("dao.trustednodes.setting.", "minipool"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.bond.reduction.window.start")), 2 days);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.bond.reduction.window.length")), 2 days);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.cancel.bond.reduction.quorum")), 0.51 ether);
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "minipool"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.user.distribute.window.start")), 14 days);
        setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.user.distribute.window.length")), 2 days);
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "node"));
        setBool(keccak256(abi.encodePacked(settingNameSpace, "node.vacant.minipools.enabled")), true);

        // Claim intervals
        for (uint256 i = 0; i < intervals.length; i++) {
            ClaimInterval memory interval = intervals[i];
            setUint(keccak256(abi.encodePacked("rewards.pool.interval.execution.block", interval.interval)), interval.block);
        }
    }

    /// @dev Add a new network contract
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

    /// @dev Upgrade a network contract
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

    /// @dev Deletes a network contract
    function _deleteContract(string memory _name) internal {
        address contractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.name", contractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", contractAddress)));
        deleteAddress(keccak256(abi.encodePacked("contract.address", _name)));
        deleteString(keccak256(abi.encodePacked("contract.abi", _name)));
    }

    /// @dev Upgrade a network contract ABI
    function _upgradeABI(string memory _name, string memory _contractAbi) internal {
        // Check ABI exists
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length > 0, "ABI does not exist");
        // Sanity checks
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        require(keccak256(bytes(existingAbi)) != keccak256(bytes(_contractAbi)), "ABIs are identical");
        // Set ABI
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
    }
}