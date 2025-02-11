// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketBase} from "../RocketBase.sol";

interface InitialiseInterface {
    function initialise() external;
}

/// @notice v1.4 Saturn 1 upgrade contract
contract RocketUpgradeOneDotFour is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the contract is locked to further changes
    bool public locked;

    // Upgrade contracts
    address public rocketMegapoolDelegate;
    address public rocketMegapoolFactory;
    address public rocketMegapoolProxy;
    address public rocketMegapoolManager;
    address public rocketNodeManager;
    address public rocketNodeDeposit;
    address public rocketNodeStaking;
    address public rocketDepositPool;
    address public linkedListStorage;
    address public rocketDAOProtocolSettingsNode;
    address public rocketDAOProtocolSettingsDeposit;
    address public rocketDAOProtocolSettingsNetwork;
    address public rocketDAOProtocolSettingsSecurity;
    address public rocketDAOProtocolSettingsMegapool;
    address public rocketDAOSecurityProposals;
    address public rocketNetworkRevenues;
    address public rocketNetworkSnapshots;
    address public rocketVoterRewards;
    address public blockRoots;
    address public beaconStateVerifier;

    // Upgrade ABIs
    string public rocketMegapoolDelegateAbi;
    string public rocketMegapoolFactoryAbi;
    string public rocketMegapoolProxyAbi;
    string public rocketMegapoolManagerAbi;
    string public rocketNodeManagerAbi;
    string public rocketNodeDepositAbi;
    string public rocketNodeStakingAbi;
    string public rocketDepositPoolAbi;
    string public linkedListStorageAbi;
    string public rocketDAOProtocolSettingsNodeAbi;
    string public rocketDAOProtocolSettingsDepositAbi;
    string public rocketDAOProtocolSettingsNetworkAbi;
    string public rocketDAOProtocolSettingsSecurityAbi;
    string public rocketDAOProtocolSettingsMegapoolAbi;
    string public rocketDAOSecurityProposalsAbi;
    string public rocketNetworkRevenuesAbi;
    string public rocketNetworkSnapshotsAbi;
    string public rocketVoterRewardsAbi;
    string public blockRootsAbi;
    string public beaconStateVerifierAbi;

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

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    function set(address[] memory _addresses, string[] memory _abis) external {
        require(msg.sender == deployer, "Only deployer");
        require(!locked, "Contract locked");

        // Set contract addresses
        rocketMegapoolDelegate = _addresses[0];
        rocketMegapoolFactory = _addresses[1];
        rocketMegapoolProxy = _addresses[2];
        rocketMegapoolManager = _addresses[3];
        rocketNodeManager = _addresses[4];
        rocketNodeDeposit = _addresses[5];
        rocketNodeStaking = _addresses[6];
        rocketDepositPool = _addresses[7];
        linkedListStorage = _addresses[8];
        rocketDAOProtocolSettingsNode = _addresses[9];
        rocketDAOProtocolSettingsDeposit = _addresses[10];
        rocketDAOProtocolSettingsNetwork = _addresses[11];
        rocketDAOProtocolSettingsSecurity = _addresses[12];
        rocketDAOProtocolSettingsMegapool = _addresses[13];
        rocketDAOSecurityProposals = _addresses[14];
        rocketNetworkRevenues = _addresses[15];
        rocketNetworkSnapshots = _addresses[16];
        rocketVoterRewards = _addresses[17];
        blockRoots = _addresses[18];
        beaconStateVerifier = _addresses[19];

        // Set ABIs
        rocketMegapoolDelegateAbi = _abis[0];
        rocketMegapoolFactoryAbi = _abis[1];
        rocketMegapoolProxyAbi = _abis[2];
        rocketMegapoolManagerAbi = _abis[3];
        rocketNodeManagerAbi = _abis[4];
        rocketNodeDepositAbi = _abis[5];
        rocketNodeStakingAbi = _abis[6];
        rocketDepositPoolAbi = _abis[7];
        linkedListStorageAbi = _abis[8];
        rocketDAOProtocolSettingsNodeAbi = _abis[9];
        rocketDAOProtocolSettingsDepositAbi = _abis[10];
        rocketDAOProtocolSettingsNetworkAbi = _abis[11];
        rocketDAOProtocolSettingsSecurityAbi = _abis[12];
        rocketDAOProtocolSettingsMegapoolAbi = _abis[13];
        rocketDAOSecurityProposalsAbi = _abis[14];
        rocketNetworkRevenuesAbi = _abis[15];
        rocketNetworkSnapshotsAbi = _abis[16];
        rocketVoterRewardsAbi = _abis[17];
        blockRootsAbi = _abis[18];
        beaconStateVerifierAbi = _abis[19];
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

        // Add new contracts
        _addContract("rocketMegapoolDelegate", rocketMegapoolDelegate, rocketMegapoolDelegateAbi);
        _addContract("rocketMegapoolFactory", rocketMegapoolFactory, rocketMegapoolFactoryAbi);
        _addContract("rocketMegapoolProxy", rocketMegapoolProxy, rocketMegapoolProxyAbi);
        _addContract("rocketMegapoolManager", rocketMegapoolManager, rocketMegapoolManagerAbi);
        _addContract("linkedListStorage", linkedListStorage, linkedListStorageAbi);
        _addContract("rocketNetworkRevenues", rocketNetworkRevenues, rocketNetworkRevenuesAbi);
        _addContract("blockRoots", blockRoots, blockRootsAbi);
        _addContract("beaconStateVerifier", beaconStateVerifier, beaconStateVerifierAbi);
        _addContract("rocketVoterRewards", rocketVoterRewards, rocketVoterRewardsAbi);
        _addContract("rocketDAOProtocolSettingsMegapool", rocketDAOProtocolSettingsMegapool, rocketDAOProtocolSettingsMegapoolAbi);

        // Upgrade existing contracts
        _upgradeContract("rocketNodeManager", rocketNodeManager, rocketNodeManagerAbi);
        _upgradeContract("rocketNodeDeposit", rocketNodeDeposit, rocketNodeDepositAbi);
        _upgradeContract("rocketNodeStaking", rocketNodeStaking, rocketNodeStakingAbi);
        _upgradeContract("rocketDepositPool", rocketDepositPool, rocketDepositPoolAbi);
        _upgradeContract("rocketNetworkSnapshots", rocketNetworkSnapshots, rocketNetworkSnapshotsAbi);
        _upgradeContract("rocketDAOProtocolSettingsNode", rocketDAOProtocolSettingsNode, rocketDAOProtocolSettingsNodeAbi);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", rocketDAOProtocolSettingsDeposit, rocketDAOProtocolSettingsDepositAbi);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", rocketDAOProtocolSettingsNetwork, rocketDAOProtocolSettingsNetworkAbi);
        _upgradeContract("rocketDAOProtocolSettingsSecurity", rocketDAOProtocolSettingsSecurity, rocketDAOProtocolSettingsSecurityAbi);
        _upgradeContract("rocketDAOSecurityProposals", rocketDAOSecurityProposals, rocketDAOSecurityProposalsAbi);

        // Init the megapool factory
        InitialiseInterface(rocketMegapoolFactory).initialise();

        // Initialise the new megapool settings contract
        InitialiseInterface(rocketDAOProtocolSettingsMegapool).initialise();

        // Add new security council allowed parameter
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.node.commission.share.security.council.adder")), true);

        // Set socialised assignments to 0 per RPIP-59
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "deposit"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.assign.socialised.maximum")), 0);

        // Initialise UARS setting defaults per RPIP-46
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share")), 0.05 ether);                        // 5% (RPIP-46)
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share.security.council.adder")), 0 ether);    // 0% (RPIP-46)
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.voter.share")), 0.09 ether);                                  // 9% (RPIP-46)
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.max.node.commission.share.council.adder")), 0.01 ether);      // 1% (RPIP-46)

        // Initialise UARS system
        RocketNetworkRevenuesInterface rocketNetworkRevenuesInstance = RocketNetworkRevenuesInterface(rocketNetworkRevenues);
        rocketNetworkRevenuesInstance.initialise(0.05 ether, 0.09 ether); // 5% node share, 9% voter share (RPIP-46)

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.4");
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
}
