// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";

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
    address public rocketDAOProtocolVerifier;
    address public rocketDAOProtocolSettingsProposals;
    address public rocketDAOProtocolSettingsSecurity;
    address public rocketDAOSecurity;
    address public rocketDAOSecurityActions;
    address public rocketDAOSecurityProposals;
    address public rocketNetworkSnapshots;
    address public rocketNetworkVoting;

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
    string public rocketDAOProtocolVerifierAbi;
    string public rocketDAOProtocolSettingsProposalsAbi;
    string public rocketDAOProtocolSettingsSecurityAbi;
    string public rocketDAOSecurityAbi;
    string public rocketDAOSecurityActionsAbi;
    string public rocketDAOSecurityProposalsAbi;
    string public rocketNetworkSnapshotsAbi;
    string public rocketNetworkVotingAbi;

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
        rocketDAOProtocolVerifier = _addresses[11];
        rocketDAOProtocolSettingsProposals = _addresses[12];
        rocketDAOProtocolSettingsSecurity = _addresses[13];
        rocketDAOSecurity = _addresses[14];
        rocketDAOSecurityActions = _addresses[15];
        rocketDAOSecurityProposals = _addresses[16];
        rocketNetworkSnapshots = _addresses[17];
        rocketNetworkVoting = _addresses[18];

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
        rocketDAOProtocolVerifierAbi = _abis[11];
        rocketDAOProtocolSettingsProposalsAbi = _abis[12];
        rocketDAOProtocolSettingsSecurityAbi = _abis[13];
        rocketDAOSecurityAbi = _abis[14];
        rocketDAOSecurityActionsAbi = _abis[15];
        rocketDAOSecurityProposalsAbi = _abis[16];
        rocketNetworkSnapshotsAbi = _abis[17];
        rocketNetworkVotingAbi = _abis[18];
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

        // Add new contracts
        _addContract("rocketDAOProtocolVerifier", rocketDAOProtocolVerifier, rocketDAOProtocolVerifierAbi);
        _addContract("rocketDAOProtocolSettingsProposals", rocketDAOProtocolSettingsProposals, rocketDAOProtocolSettingsProposalsAbi);
        _addContract("rocketDAOProtocolSettingsSecurity", rocketDAOProtocolSettingsSecurity, rocketDAOProtocolSettingsSecurityAbi);
        _addContract("rocketDAOSecurity", rocketDAOSecurity, rocketDAOSecurityAbi);
        _addContract("rocketDAOSecurityActions", rocketDAOSecurityActions, rocketDAOSecurityActionsAbi);
        _addContract("rocketDAOSecurityProposals", rocketDAOSecurityProposals, rocketDAOSecurityProposalsAbi);
        _addContract("rocketNetworkSnapshots", rocketNetworkSnapshots, rocketNetworkSnapshotsAbi);
        _addContract("rocketNetworkVoting", rocketNetworkVoting, rocketNetworkVotingAbi);

        // pDAO proposal settings
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "proposals"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.time")), 2 weeks);            // How long a proposal can be voted on
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.vote.delay.time")), 1 weeks);      // How long before a proposal can be voted on after it is created
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.execute.time")), 4 weeks);         // How long a proposal can be executed after its voting period is finished
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.bond")), 100 ether);               // The amount of RPL a proposer has to put up as a bond for creating a new proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.challenge.bond")), 10 ether);      // The amount of RPL a challenger has to put up as a bond for challenging a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.challenge.period")), 30 minutes);  // The amount of time a proposer has to respond to a challenge before a proposal is defeated
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.quorum")), 0.51 ether);            // The quorum required to pass a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.veto.quorum")), 0.51 ether);       // The quorum required to veto a proposal
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.max.block.age")), 1024);           // The maximum age of a block a proposal can be raised at

        // pDAO security council settings
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "security"));
        setUint(keccak256(abi.encodePacked("members.quorum")), 0.51 ether);       // Member quorum threshold that must be met for proposals to pass (51%)
        setUint(keccak256(abi.encodePacked("members.leave.time")), 4 weeks);      // How long a member must give notice for before manually leaving the security council
        setUint(keccak256(abi.encodePacked("proposal.vote.time")), 2 weeks);      // How long a proposal can be voted on
        setUint(keccak256(abi.encodePacked("proposal.execute.time")), 4 weeks);   // How long a proposal can be executed after its voting period is finished
        setUint(keccak256(abi.encodePacked("proposal.action.time")), 4 weeks);    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires

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
        bytes32 priceKey = keccak256("network.prices.rpl");
        rocketNetworkSnapshots.push(priceKey, uint32(block.number), uint224(rocketNetworkPrices.getRPLPrice()));
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