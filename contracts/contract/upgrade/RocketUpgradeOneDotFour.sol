// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketBase} from "../RocketBase.sol";

interface InitialiseInterface {
    function initialise() external;
}

/// @notice v1.4 Saturn 1 upgrade contract
contract RocketUpgradeOneDotFour is RocketBase {
    // Whether the upgrade has been performed or not
    bool internal executed;

    // Upgrade contracts
    address public immutable rocketMegapoolDelegate;
    address public immutable rocketMegapoolFactory;
    address public immutable rocketMegapoolProxy;
    address public immutable rocketMegapoolManager;
    address public immutable rocketNodeManager;
    address public immutable rocketNodeDeposit;
    address public immutable rocketNodeStaking;
    address public immutable rocketDepositPool;
    address public immutable linkedListStorage;
    address public immutable rocketDAOProtocol;
    address public immutable rocketDAOProtocolProposals;
    address public immutable rocketDAOProtocolSettingsNode;
    address public immutable rocketDAOProtocolSettingsDeposit;
    address public immutable rocketDAOProtocolSettingsNetwork;
    address public immutable rocketDAOProtocolSettingsSecurity;
    address public immutable rocketDAOProtocolSettingsMegapool;
    address public immutable rocketDAOProtocolSettingsMinipool;
    address public immutable rocketDAOSecurityUpgrade;
    address public immutable rocketDAOSecurityProposals;
    address public immutable rocketDAONodeTrustedUpgrade;
    address public immutable rocketNetworkRevenues;
    address public immutable rocketNetworkBalances;
    address public immutable rocketNetworkSnapshots;
    address public immutable rocketNetworkPenalties;
    address public immutable rocketRewardsPool;
    address public immutable blockRoots;
    address public immutable beaconStateVerifier;
    address public immutable rocketNodeDistributorDelegate;
    address public immutable rocketClaimDAO;
    address public immutable rocketMinipoolBonderReducer;
    address public immutable rocketNetworkVoting;
    address public immutable rocketMerkleDistributorMainnet;

    // Upgrade ABIs
    string[32] public abis;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        address[32] memory _addresses,
        string[32] memory _abis
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;

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
        rocketDAOProtocol = _addresses[9];
        rocketDAOProtocolProposals = _addresses[10];
        rocketDAOProtocolSettingsNode = _addresses[11];
        rocketDAOProtocolSettingsDeposit = _addresses[12];
        rocketDAOProtocolSettingsNetwork = _addresses[13];
        rocketDAOProtocolSettingsSecurity = _addresses[14];
        rocketDAOProtocolSettingsMegapool = _addresses[15];
        rocketDAOProtocolSettingsMinipool = _addresses[16];
        rocketDAOSecurityUpgrade = _addresses[17];
        rocketDAOSecurityProposals = _addresses[18];
        rocketDAONodeTrustedUpgrade = _addresses[19];
        rocketNetworkRevenues = _addresses[20];
        rocketNetworkBalances = _addresses[21];
        rocketNetworkSnapshots = _addresses[22];
        rocketNetworkPenalties = _addresses[23];
        rocketRewardsPool = _addresses[24];
        blockRoots = _addresses[25];
        beaconStateVerifier = _addresses[26];
        rocketNodeDistributorDelegate = _addresses[27];
        rocketClaimDAO = _addresses[28];
        rocketMinipoolBonderReducer = _addresses[29];
        rocketNetworkVoting = _addresses[30];
        rocketMerkleDistributorMainnet = _addresses[31];

        // Set ABIs
        abis = _abis;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed);
        executed = true;

        // Add new contracts
        _addContract("rocketMegapoolDelegate", rocketMegapoolDelegate, abis[0]);
        _addContract("rocketMegapoolFactory", rocketMegapoolFactory, abis[1]);
        _addContract("rocketMegapoolProxy", rocketMegapoolProxy, abis[2]);
        _addContract("rocketMegapoolManager", rocketMegapoolManager, abis[3]);
        _addContract("linkedListStorage", linkedListStorage, abis[8]);
        _addContract("rocketNetworkRevenues", rocketNetworkRevenues, abis[20]);
        _addContract("blockRoots", blockRoots, abis[23]);
        _addContract("beaconStateVerifier", beaconStateVerifier, abis[24]);
        _addContract("rocketDAOProtocolSettingsMegapool", rocketDAOProtocolSettingsMegapool, abis[15]);
        _addContract("rocketDAOSecurityUpgrade", rocketDAOSecurityUpgrade, abis[17]);

        // Upgrade existing contracts
        _upgradeContract("rocketNodeManager", rocketNodeManager, abis[4]);
        _upgradeContract("rocketNodeDeposit", rocketNodeDeposit, abis[5]);
        _upgradeContract("rocketNodeStaking", rocketNodeStaking, abis[6]);
        _upgradeContract("rocketNetworkBalances", rocketNetworkBalances, abis[21]);
        _upgradeContract("rocketNetworkPenalties", rocketNetworkPenalties, abis[23]);
        _upgradeContract("rocketDepositPool", rocketDepositPool, abis[7]);
        _upgradeContract("rocketNetworkSnapshots", rocketNetworkSnapshots, abis[22]);
        _upgradeContract("rocketDAOProtocol", rocketDAOProtocol, abis[9]);
        _upgradeContract("rocketDAOProtocolProposals", rocketDAOProtocolProposals, abis[10]);
        _upgradeContract("rocketDAOProtocolSettingsNode", rocketDAOProtocolSettingsNode, abis[11]);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", rocketDAOProtocolSettingsDeposit, abis[12]);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", rocketDAOProtocolSettingsNetwork, abis[13]);
        _upgradeContract("rocketDAOProtocolSettingsSecurity", rocketDAOProtocolSettingsSecurity, abis[14]);
        _upgradeContract("rocketDAOProtocolSettingsMinipool", rocketDAOProtocolSettingsMinipool, abis[16]);
        _upgradeContract("rocketDAONodeTrustedUpgrade", rocketDAONodeTrustedUpgrade, abis[19]);
        _upgradeContract("rocketDAOSecurityProposals", rocketDAOSecurityProposals, abis[18]);
        _upgradeContract("rocketNodeDistributorDelegate", rocketNodeDistributorDelegate, abis[27]);
        _upgradeContract("rocketRewardsPool", rocketRewardsPool, abis[24]);
        _upgradeContract("rocketClaimDAO", rocketClaimDAO, abis[28]);
        _upgradeContract("rocketMinipoolBondReducer", rocketMinipoolBonderReducer, abis[29]);
        _upgradeContract("rocketNetworkVoting", rocketNetworkVoting, abis[30]);
        _upgradeContract("rocketMerkleDistributorMainnet", rocketMerkleDistributorMainnet, abis[31]);

        // Initialise the rewards relay address
        InitialiseInterface(rocketMerkleDistributorMainnet).initialise();

        // Initialise the megapool factory
        InitialiseInterface(rocketMegapoolFactory).initialise();

        // Initialise the new megapool settings contract
        InitialiseInterface(rocketDAOProtocolSettingsMegapool).initialise();

        // Add new security council allowed parameter
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.node.commission.share.security.council.adder")), true);

        // Deposit settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "deposit"));
            // Set socialised assignments to 0 per RPIP-59
            setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.assign.socialised.maximum")), 0);
            // Set default express queue settings per RPIP-59
            setUint(keccak256(abi.encodePacked(settingNameSpace, "express.queue.rate")), 2);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "express.queue.tickets.base.provision")), 2);
        }

        // Network settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
            // Initialise UARS setting defaults per RPIP-46
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share")), 0.05 ether);                        // 5% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share.security.council.adder")), 0 ether);    // 0% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.voter.share")), 0.09 ether);                                  // 9% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.pdao.share")), 0 ether);                                      // 0% (RPIP-72)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.max.node.commission.share.council.adder")), 0.01 ether);      // 1% (RPIP-46)
            // Initialise max rETH delta per RPIP-61
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.max.reth.balance.delta")), 0.02 ether);                       // 2% (RPIP-61)
        }

        // Node settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "node"));
            // Initialised reduced_bond and unstaking_period setting per RPIP-42 and RPIP-30
            setUint(keccak256(abi.encodePacked(settingNameSpace, "reduced.bond")), 4 ether);                    // 4 ether (RPIP-42)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.unstaking.period")), 28 days);           // 28 days (RPIP-30)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.megapool.minimum.stake")), 0.15 ether);  // 15% (RPIP-30)
        }

        // Minipool settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "minipool"));
            setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.maximum.penalty.count")), 2500);     // 2,500 penalties (RPIP-58)
        }

        // Security settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "security"));
            // Set protocol upgrade settings per RPIP-60
            setUint(keccak256(abi.encodePacked(settingNameSpace, "upgrade.delay")), 7 days);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "upgradeveto.quorum")), 0.33 ether);
        }

        // Initialise UARS system
        RocketNetworkRevenuesInterface rocketNetworkRevenuesInstance = RocketNetworkRevenuesInterface(rocketNetworkRevenues);
        rocketNetworkRevenuesInstance.initialise(0.05 ether, 0.09 ether, 0); // 5% node share, 9% voter share, 0% pdao share (RPIP-46)

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.4");
    }

    /// @dev Upgrade a network contract
    function _upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Get old contract address & check contract exists
        address oldContractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        require(oldContractAddress != address(0x0));
        // Check new contract address
        require(_contractAddress != address(0x0));
        require(_contractAddress != oldContractAddress);
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))));
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0);
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
        require(bytes(_name).length > 0);
        // Cannot add contract if it already exists (use upgradeContract instead)
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0));
        // Cannot add contract if already in use as ABI only
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length == 0);
        // Check contract address
        require(_contractAddress != address(0x0));
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))));
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0);
        // Register contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
    }
}
