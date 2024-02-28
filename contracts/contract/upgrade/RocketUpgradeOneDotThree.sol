// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";

/// @notice Transient contract to upgrade Rocket Pool with the Houston set of contract upgrades
contract RocketUpgradeOneDotThree is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the contract is locked to further changes
    bool public locked;

    // Upgrade contracts
    address public newRocketDAOProtocol;
    address public newRocketDAOProtocolProposals;
    address public newRocketNetworkPrices;
    address public newRocketNodeDeposit;
    address public newRocketNodeManager;
    address public newRocketNodeStaking;
    address public newRocketClaimDAO;
    address public newRocketDAOProtocolSettingsRewards;
    address public newRocketMinipoolManager;
    address public newRocketRewardsPool;
    address public newRocketNetworkBalances;
    address public newRocketDAOProtocolSettingsNetwork;
    address public newRocketDAOProtocolSettingsAuction;
    address public newRocketDAOProtocolSettingsDeposit;
    address public newRocketDAOProtocolSettingsInflation;
    address public newRocketDAOProtocolSettingsMinipool;
    address public newRocketDAOProtocolSettingsNode;
    address public newRocketMerkleDistributorMainnet;
    address public rocketDAOProtocolVerifier;
    address public rocketDAOProtocolSettingsProposals;
    address public rocketDAOProtocolSettingsSecurity;
    address public rocketDAOSecurity;
    address public rocketDAOSecurityActions;
    address public rocketDAOSecurityProposals;
    address public rocketNetworkSnapshots;
    address public rocketNetworkVoting;
    address public rocketDAOProtocolProposal;

    // Upgrade ABIs
    string public newRocketDAOProtocolAbi;
    string public newRocketDAOProtocolProposalsAbi;
    string public newRocketNetworkPricesAbi;
    string public newRocketNodeDepositAbi;
    string public newRocketNodeManagerAbi;
    string public newRocketNodeStakingAbi;
    string public newRocketClaimDAOAbi;
    string public newRocketDAOProtocolSettingsRewardsAbi;
    string public newRocketMinipoolManagerAbi;
    string public newRocketRewardsPoolAbi;
    string public newRocketNetworkBalancesAbi;
    string public newRocketDAOProtocolSettingsNetworkAbi;
    string public newRocketDAOProtocolSettingsAuctionAbi;
    string public newRocketDAOProtocolSettingsDepositAbi;
    string public newRocketDAOProtocolSettingsInflationAbi;
    string public newRocketDAOProtocolSettingsMinipoolAbi;
    string public newRocketDAOProtocolSettingsNodeAbi;
    string public newRocketMerkleDistributorMainnetAbi;
    string public rocketDAOProtocolVerifierAbi;
    string public rocketDAOProtocolSettingsProposalsAbi;
    string public rocketDAOProtocolSettingsSecurityAbi;
    string public rocketDAOSecurityAbi;
    string public rocketDAOSecurityActionsAbi;
    string public rocketDAOSecurityProposalsAbi;
    string public rocketNetworkSnapshotsAbi;
    string public rocketNetworkVotingAbi;
    string public rocketDAOProtocolProposalAbi;

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
        newRocketDAOProtocol = _addresses[0];
        newRocketDAOProtocolProposals = _addresses[1];
        newRocketNetworkPrices = _addresses[2];
        newRocketNodeDeposit = _addresses[3];
        newRocketNodeManager = _addresses[4];
        newRocketNodeStaking = _addresses[5];
        newRocketClaimDAO = _addresses[6];
        newRocketDAOProtocolSettingsRewards = _addresses[7];
        newRocketMinipoolManager = _addresses[8];
        newRocketRewardsPool = _addresses[9];
        newRocketNetworkBalances = _addresses[10];
        newRocketDAOProtocolSettingsNetwork = _addresses[11];
        newRocketDAOProtocolSettingsAuction = _addresses[12];
        newRocketDAOProtocolSettingsDeposit = _addresses[13];
        newRocketDAOProtocolSettingsInflation = _addresses[14];
        newRocketDAOProtocolSettingsMinipool = _addresses[15];
        newRocketDAOProtocolSettingsNode = _addresses[16];
        newRocketMerkleDistributorMainnet = _addresses[17];
        rocketDAOProtocolVerifier = _addresses[18];
        rocketDAOProtocolSettingsProposals = _addresses[19];
        rocketDAOProtocolSettingsSecurity = _addresses[20];
        rocketDAOSecurity = _addresses[21];
        rocketDAOSecurityActions = _addresses[22];
        rocketDAOSecurityProposals = _addresses[23];
        rocketNetworkSnapshots = _addresses[24];
        rocketNetworkVoting = _addresses[25];
        rocketDAOProtocolProposal = _addresses[26];

        // Set ABIs
        newRocketDAOProtocolAbi = _abis[0];
        newRocketDAOProtocolProposalsAbi = _abis[1];
        newRocketNetworkPricesAbi = _abis[2];
        newRocketNodeDepositAbi = _abis[3];
        newRocketNodeManagerAbi = _abis[4];
        newRocketNodeStakingAbi = _abis[5];
        newRocketClaimDAOAbi = _abis[6];
        newRocketDAOProtocolSettingsRewardsAbi = _abis[7];
        newRocketMinipoolManagerAbi = _abis[8];
        newRocketRewardsPoolAbi = _abis[9];
        newRocketNetworkBalancesAbi = _abis[10];
        newRocketDAOProtocolSettingsNetworkAbi = _abis[11];
        newRocketDAOProtocolSettingsAuctionAbi = _abis[12];
        newRocketDAOProtocolSettingsDepositAbi = _abis[13];
        newRocketDAOProtocolSettingsInflationAbi = _abis[14];
        newRocketDAOProtocolSettingsMinipoolAbi = _abis[15];
        newRocketDAOProtocolSettingsNodeAbi = _abis[16];
        newRocketMerkleDistributorMainnetAbi = _abis[17];
        rocketDAOProtocolVerifierAbi = _abis[18];
        rocketDAOProtocolSettingsProposalsAbi = _abis[19];
        rocketDAOProtocolSettingsSecurityAbi = _abis[20];
        rocketDAOSecurityAbi = _abis[21];
        rocketDAOSecurityActionsAbi = _abis[22];
        rocketDAOSecurityProposalsAbi = _abis[23];
        rocketNetworkSnapshotsAbi = _abis[24];
        rocketNetworkVotingAbi = _abis[25];
        rocketDAOProtocolProposalAbi = _abis[26];
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

        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        uint224 maxPerMinipoolStake = uint224(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake());

        // Upgrade contracts
        _upgradeContract("rocketDAOProtocol", newRocketDAOProtocol, newRocketDAOProtocolAbi);
        _upgradeContract("rocketDAOProtocolProposals", newRocketDAOProtocolProposals, newRocketDAOProtocolProposalsAbi);
        _upgradeContract("rocketNetworkPrices", newRocketNetworkPrices, newRocketNetworkPricesAbi);
        _upgradeContract("rocketNodeDeposit", newRocketNodeDeposit, newRocketNodeDepositAbi);
        _upgradeContract("rocketNodeManager", newRocketNodeManager, newRocketNodeManagerAbi);
        _upgradeContract("rocketNodeStaking", newRocketNodeStaking, newRocketNodeStakingAbi);
        _upgradeContract("rocketClaimDAO", newRocketClaimDAO, newRocketClaimDAOAbi);
        _upgradeContract("rocketDAOProtocolSettingsRewards", newRocketDAOProtocolSettingsRewards, newRocketDAOProtocolSettingsRewardsAbi);
        _upgradeContract("rocketMinipoolManager", newRocketMinipoolManager, newRocketMinipoolManagerAbi);
        _upgradeContract("rocketRewardsPool", newRocketRewardsPool, newRocketRewardsPoolAbi);
        _upgradeContract("rocketNetworkBalances", newRocketNetworkBalances, newRocketNetworkBalancesAbi);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", newRocketDAOProtocolSettingsNetwork, newRocketDAOProtocolSettingsNetworkAbi);
        _upgradeContract("rocketDAOProtocolSettingsAuction", newRocketDAOProtocolSettingsAuction, newRocketDAOProtocolSettingsAuctionAbi);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", newRocketDAOProtocolSettingsDeposit, newRocketDAOProtocolSettingsDepositAbi);
        _upgradeContract("rocketDAOProtocolSettingsInflation", newRocketDAOProtocolSettingsInflation, newRocketDAOProtocolSettingsInflationAbi);
        _upgradeContract("rocketDAOProtocolSettingsMinipool", newRocketDAOProtocolSettingsMinipool, newRocketDAOProtocolSettingsMinipoolAbi);
        _upgradeContract("rocketDAOProtocolSettingsNode", newRocketDAOProtocolSettingsNode, newRocketDAOProtocolSettingsNodeAbi);
        _upgradeContract("rocketMerkleDistributorMainnet", newRocketMerkleDistributorMainnet, newRocketMerkleDistributorMainnetAbi);

        // Add new contracts
        _addContract("rocketDAOProtocolVerifier", rocketDAOProtocolVerifier, rocketDAOProtocolVerifierAbi);
        _addContract("rocketDAOProtocolSettingsProposals", rocketDAOProtocolSettingsProposals, rocketDAOProtocolSettingsProposalsAbi);
        _addContract("rocketDAOProtocolSettingsSecurity", rocketDAOProtocolSettingsSecurity, rocketDAOProtocolSettingsSecurityAbi);
        _addContract("rocketDAOSecurity", rocketDAOSecurity, rocketDAOSecurityAbi);
        _addContract("rocketDAOSecurityActions", rocketDAOSecurityActions, rocketDAOSecurityActionsAbi);
        _addContract("rocketDAOSecurityProposals", rocketDAOSecurityProposals, rocketDAOSecurityProposalsAbi);
        _addContract("rocketNetworkSnapshots", rocketNetworkSnapshots, rocketNetworkSnapshotsAbi);
        _addContract("rocketNetworkVoting", rocketNetworkVoting, rocketNetworkVotingAbi);
        _addContract("rocketDAOProtocolProposal", rocketDAOProtocolProposal, rocketDAOProtocolProposalAbi);

        // Update the rewards relay address
        bytes32 networkRelayKey = keccak256(abi.encodePacked("rewards.relay.address", uint256(0)));
        setAddress(networkRelayKey, newRocketMerkleDistributorMainnet);

        // pDAO proposal settings
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "proposals"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.phase1.time")), 1 weeks);     // How long a proposal can be voted on in phase 1
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.phase2.time")), 1 weeks);     // How long a proposal can be voted on in phase 2
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.delay.time")), 1 weeks);      // How long before a proposal can be voted on after it is created
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.execute.time")), 4 weeks);         // How long a proposal can be executed after its voting period is finished
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.bond")), 100 ether);               // The amount of RPL a proposer has to put up as a bond for creating a new proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.challenge.bond")), 10 ether);      // The amount of RPL a challenger has to put up as a bond for challenging a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.challenge.period")), 30 minutes);  // The amount of time a proposer has to respond to a challenge before a proposal is defeated
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.quorum")), 0.51 ether);            // The quorum required to pass a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.veto.quorum")), 0.51 ether);       // The quorum required to veto a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.max.block.age")), 1024);           // The maximum age of a block a proposal can be raised at

        // pDAO network settings
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.submit.balances.frequency")), 1 days);          // 24 hours
        setUint(keccak256(abi.encodePacked(settingNameSpace, "network.submit.prices.frequency")), 1 days);            // 24 hours

        // pDAO rewards settings
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "rewards"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "rewards.claims", "periods")), 28);

        // pDAO security council settings
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "security"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "members.quorum")), 0.51 ether);       // Member quorum threshold that must be met for proposals to pass (51%)
        setUint(keccak256(abi.encodePacked(settingNameSpace, "members.leave.time")), 4 weeks);      // How long a member must give notice for before manually leaving the security council
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.time")), 2 weeks);      // How long a proposal can be voted on
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.execute.time")), 4 weeks);   // How long a proposal can be executed after its voting period is finished
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.action.time")), 4 weeks);    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires

        // Default permissions for security council
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "deposit", "deposit.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "deposit", "deposit.assign.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "minipool", "minipool.submit.withdrawable.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "minipool", "minipool.bond.reduction.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.submit.balances.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.submit.prices.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.registration.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.smoothing.pool.registration.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.deposit.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.vacant.minipools.enabled")), true);

        // Initialise RPL price in snapshot system
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        bytes32 snapshotKey = keccak256("network.prices.rpl");
        rocketNetworkSnapshots.push(snapshotKey, uint32(block.number), uint224(rocketNetworkPrices.getRPLPrice()));

        // Add snapshot entry for maximum RPL stake
        snapshotKey = keccak256(bytes("node.per.minipool.stake.maximum"));
        rocketNetworkSnapshots.push(snapshotKey, uint32(block.number), maxPerMinipoolStake);

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.3.0");
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
}