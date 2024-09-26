// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";

/// @notice v1.3.1 hotfix upgrade contract
contract RocketUpgradeOneDotThreeDotOne is RocketBase {

    // Struct to hold data for correcting miscalculated ETH matched
    struct Correction {
        address nodeAddress;
        int256 delta;
    }

    // Whether the upgrade has been performed or not
    bool public executed;

    // Whether the contract is locked to further changes
    bool public locked;

    // Upgrade contracts
    address public newRocketDAOProposal;
    address public newRocketDAOProtocolProposal;
    address public newRocketDAOProtocolVerifier;
    address public newRocketDAOProtocolSettingsProposals;
    address public newRocketDAOProtocolSettingsAuction;
    address public newRocketMinipoolManager;
    address public newRocketNodeStaking;
    address public newRocketMinipoolDelegate;
    address public newRocketNodeDeposit;
    address public newRocketNetworkVoting;

    // Upgrade ABIs
    string public newRocketDAOProposalAbi;
    string public newRocketDAOProtocolProposalAbi;
    string public newRocketDAOProtocolVerifierAbi;
    string public newRocketDAOProtocolSettingsProposalsAbi;
    string public newRocketDAOProtocolSettingsAuctionAbi;
    string public newRocketMinipoolManagerAbi;
    string public newRocketNodeStakingAbi;
    string public newRocketMinipoolDelegateAbi;
    string public newRocketNodeDepositAbi;
    string public newRocketNetworkVotingAbi;

    // Save deployer to limit access to set functions
    address immutable deployer;

    // Corrections
    Correction[] public corrections;

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
        newRocketDAOProposal = _addresses[0];
        newRocketDAOProtocolProposal = _addresses[1];
        newRocketDAOProtocolVerifier = _addresses[2];
        newRocketDAOProtocolSettingsProposals = _addresses[3];
        newRocketDAOProtocolSettingsAuction = _addresses[4];
        newRocketMinipoolManager = _addresses[5];
        newRocketNodeStaking = _addresses[6];
        newRocketMinipoolDelegate = _addresses[7];
        newRocketNodeDeposit = _addresses[8];
        newRocketNetworkVoting = _addresses[9];

        // Set ABIs
        newRocketDAOProposalAbi = _abis[0];
        newRocketDAOProtocolProposalAbi = _abis[1];
        newRocketDAOProtocolVerifierAbi = _abis[2];
        newRocketDAOProtocolSettingsProposalsAbi = _abis[3];
        newRocketDAOProtocolSettingsAuctionAbi = _abis[4];
        newRocketMinipoolManagerAbi = _abis[5];
        newRocketNodeStakingAbi = _abis[6];
        newRocketMinipoolDelegateAbi = _abis[7];
        newRocketNodeDepositAbi = _abis[8];
        newRocketNetworkVotingAbi = _abis[9];

        // Note: rocketMinipool abi has not changed so does not require updating

        // Modify pDAO quorum to 30% per RPIP-63
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "proposals"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "proposal.quorum")), 0.30 ether);

        // Apply ETH matched corrections
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key;
        for (uint256 i = 0; i < corrections.length; i++) {
            Correction memory correction = corrections[i];
            key = keccak256(abi.encodePacked("eth.matched.node.amount", correction.nodeAddress));
            // Cast is safe as current values cannot exceed max value of int256 as not enough ETH exists for that
            (,uint224 currentValue,) = rocketNetworkSnapshots.latest(key);
            int256 newValue = int256(uint256(currentValue)) + correction.delta;
            rocketNetworkSnapshots.push(key, uint224(uint256(newValue)));
        }
    }

    /// @notice Adds a new entry into the array of corrections for ETH matched
    function addCorrection(address _nodeAddress, int256 _delta) external {
        require(msg.sender == deployer, "Only deployer");
        require(!locked, "Contract locked");

        corrections.push(Correction({
            nodeAddress: _nodeAddress,
            delta: _delta
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
        _upgradeContract("rocketDAOProposal", newRocketDAOProposal, newRocketDAOProposalAbi);
        _upgradeContract("rocketDAOProtocolProposal", newRocketDAOProtocolProposal, newRocketDAOProtocolProposalAbi);
        _upgradeContract("rocketDAOProtocolVerifier", newRocketDAOProtocolVerifier, newRocketDAOProtocolVerifierAbi);
        _upgradeContract("rocketDAOProtocolSettingsProposals", newRocketDAOProtocolSettingsProposals, newRocketDAOProtocolSettingsProposalsAbi);
        _upgradeContract("rocketDAOProtocolSettingsAuction", newRocketDAOProtocolSettingsAuction, newRocketDAOProtocolSettingsAuctionAbi);
        _upgradeContract("rocketMinipoolManager", newRocketMinipoolManager, newRocketMinipoolManagerAbi);
        _upgradeContract("rocketNodeStaking", newRocketNodeStaking, newRocketNodeStakingAbi);
        _upgradeContract("rocketMinipoolDelegate", newRocketMinipoolDelegate, newRocketMinipoolDelegateAbi);
        _upgradeContract("rocketNodeDeposit", newRocketNodeDeposit, newRocketNodeDepositAbi);
        _upgradeContract("rocketNetworkVoting", newRocketNetworkVoting, newRocketNetworkVotingAbi);

        // Add missing security council permissions
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "auction", "auction.lot.create.enabled")), true);
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "auction", "auction.lot.bidding.enabled")), true);

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.3.1");
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