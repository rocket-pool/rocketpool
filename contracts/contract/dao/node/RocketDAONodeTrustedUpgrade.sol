// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../interface/RocketStorageInterface.sol";
import {RocketDAONodeTrustedUpgradeInterface} from "../../../interface/dao/node/RocketDAONodeTrustedUpgradeInterface.sol";
import {RocketDAOProtocolSettingsSecurityInterface} from "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsSecurityInterface.sol";
import {RocketBase} from "../../RocketBase.sol";

/// @notice Handles network contract upgrades
contract RocketDAONodeTrustedUpgrade is RocketBase, RocketDAONodeTrustedUpgradeInterface {
    // Events
    event UpgradePending(uint256 upgradeProposalID, bytes32 indexed upgradeType, bytes32 indexed name, uint256 time);
    event UpgradeVetoed(uint256 upgradeProposalID, uint256 time);
    event ContractUpgraded(bytes32 indexed name, address indexed oldAddress, address indexed newAddress, uint256 time);
    event ContractAdded(bytes32 indexed name, address indexed newAddress, uint256 time);
    event ABIUpgraded(bytes32 indexed name, uint256 time);
    event ABIAdded(bytes32 indexed name, uint256 time);

    // The namespace for any storage data used by this contract
    string constant private daoUpgradeNameSpace = "dao.upgrade.";

    // Immutables
    bytes32 immutable internal daoTrustedBootstrapKey;
    bytes32 immutable internal typeUpgradeContract;
    bytes32 immutable internal typeAddContract;
    bytes32 immutable internal typeUpgradeABI;
    bytes32 immutable internal typeAddABI;

    // Only allow bootstrapping when enabled
    modifier onlyBootstrapMode() {
        require(getBool(daoTrustedBootstrapKey) == false, "Bootstrap mode not engaged");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
        // Precompute keys
        typeUpgradeContract = keccak256(abi.encodePacked("upgradeContract"));
        typeAddContract = keccak256(abi.encodePacked("addContract"));
        typeUpgradeABI = keccak256(abi.encodePacked("upgradeABI"));
        typeAddABI = keccak256(abi.encodePacked("addABI"));
        daoTrustedBootstrapKey = keccak256(abi.encodePacked("dao.trustednodes.", "bootstrapmode.disabled"));
    }

    /// @notice Called when an upgrade proposal is executed, creates an upgrade proposal that can be vetoed by the
    ///         security council or executed after the upgrade delay period has passed
    /// @param _type Type of upgrade (valid values: "upgradeContract", "addContract", "upgradeABI", "addABI")
    /// @param _name Contract name to upgrade
    /// @param _contractAbi ABI of the upgraded contract
    /// @param _contractAddress Address of the upgraded contract
    function upgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) override external onlyLatestContract("rocketDAONodeTrustedProposals", msg.sender) {
        uint256 upgradeProposalID = getTotal() + 1;
        // Compute when the proposal can be executed if not vetoed by the security council
        uint256 startTime = block.timestamp;
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        uint256 endTime = startTime + rocketDAOProtocolSettingsSecurity.getUpgradeDelay();
        // Store data
        bytes32 typeHash = keccak256(abi.encodePacked(_type));
        setBytes32(keccak256(abi.encodePacked(daoUpgradeNameSpace, "type", upgradeProposalID)), typeHash);
        setString(keccak256(abi.encodePacked(daoUpgradeNameSpace, "name", upgradeProposalID)), _name);
        setString(keccak256(abi.encodePacked(daoUpgradeNameSpace, "abi", upgradeProposalID)), _contractAbi);
        setAddress(keccak256(abi.encodePacked(daoUpgradeNameSpace, "address", upgradeProposalID)), _contractAddress);
        setUint(keccak256(abi.encodePacked(daoUpgradeNameSpace, "end", upgradeProposalID)), endTime);
        addUint(keccak256(abi.encodePacked(daoUpgradeNameSpace, "total")), 1);
        // Emit event
        emit UpgradePending(upgradeProposalID, typeHash, keccak256(abi.encodePacked(_name)), block.timestamp);
    }

    /// @notice Called by the proposal contract when a veto passes
    /// @param _upgradeProposalID ID of the upgrade proposal to veto
    function veto(uint256 _upgradeProposalID) override external onlyLatestContract("rocketDAOSecurityUpgrade", msg.sender) {
        // Validate proposal state
        require(getState(_upgradeProposalID) == UpgradeProposalState.Pending, "Proposal has already succeeded, expired, or executed");
        // Mark the upgrade as vetoed
        setBool(keccak256(abi.encodePacked(daoUpgradeNameSpace, "vetoed", _upgradeProposalID)), true);
        // Emit event
        emit UpgradeVetoed(_upgradeProposalID, block.timestamp);
    }

    /// @notice Called after upgrade delay has passed to perform the upgrade
    /// @param _upgradeProposalID ID of the upgrade proposal to execute
    /// @dev Must be called by a registered trusted node
    function execute(uint256 _upgradeProposalID) override external onlyTrustedNode(msg.sender) {
        // Validate proposal state
        require(getState(_upgradeProposalID) == UpgradeProposalState.Succeeded, "Proposal has not succeeded or has been vetoed or executed");
        // Mark as executed
        setBool(keccak256(abi.encodePacked(daoUpgradeNameSpace, "executed", _upgradeProposalID)), true);
        // Execute the upgrade
        _execute(getType(_upgradeProposalID), getName(_upgradeProposalID), getUpgradeABI(_upgradeProposalID), getUpgradeAddress(_upgradeProposalID));
    }

    /// @notice Immediately execute an upgrade if bootstrap mode is still enabled
    /// @param _type Type of upgrade (valid values: "upgradeContract", "addContract", "upgradeABI", "addABI")
    /// @param _name Contract name to upgrade
    /// @param _contractAbi ABI of the upgraded contract
    /// @param _contractAddress Address of the upgraded contract
    function bootstrapUpgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) override external onlyGuardian onlyBootstrapMode {
        bytes32 typeHash = keccak256(abi.encodePacked(_type));
        _execute(typeHash, _name, _contractAbi, _contractAddress);
    }

    /// @dev Internal implementation of the execution process
    function _execute(bytes32 _typeHash, string memory _name, string memory _contractAbi, address _contractAddress) internal {
        if (_typeHash == typeUpgradeContract) _upgradeContract(_name, _contractAddress, _contractAbi);
        else if (_typeHash == typeAddContract) _addContract(_name, _contractAddress, _contractAbi);
        else if (_typeHash == typeUpgradeABI) _upgradeABI(_name, _contractAbi);
        else if (_typeHash == typeAddABI) _addABI(_name, _contractAbi);
        else revert("Invalid upgrade type");
    }

    /// @dev Performs an update to a contract and ABI simultaneously
    function _upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract being upgraded
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(nameHash != keccak256(abi.encodePacked("rocketVault")), "Cannot upgrade the vault");
        require(nameHash != keccak256(abi.encodePacked("rocketTokenRETH")), "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("rocketTokenRPL")), "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("rocketTokenRPLFixedSupply")), "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("casperDeposit")), "Cannot upgrade the casper deposit contract");
        require(nameHash != keccak256(abi.encodePacked("rocketMinipoolPenalty")), "Cannot upgrade minipool penalty contract");
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
        // Emit contract upgraded event
        emit ContractUpgraded(nameHash, oldContractAddress, _contractAddress, block.timestamp);
    }

    /// @dev Adds a new contract to the protocol
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
        // Emit contract added event
        emit ContractAdded(nameHash, _contractAddress, block.timestamp);
    }

    /// @dev Upgrades an existing ABI
    function _upgradeABI(string memory _name, string memory _contractAbi) internal {
        // Check ABI exists
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length > 0, "ABI does not exist");
        // Sanity checks
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        require(keccak256(bytes(existingAbi)) != keccak256(bytes(_contractAbi)), "ABIs are identical");
        // Set ABI
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Emit ABI upgraded event
        emit ABIUpgraded(keccak256(abi.encodePacked(_name)), block.timestamp);
    }

    /// @dev Adds a new ABI to the protocol
    function _addABI(string memory _name, string memory _contractAbi) internal {
        // Check ABI name
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(bytes(_name).length > 0, "Invalid ABI name");
        // Sanity check
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        // Cannot add ABI if name is already used for an existing network contract
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0), "ABI name is already in use");
        // Cannot add ABI if ABI already exists for this name (use upgradeABI instead)
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length == 0, "ABI name is already in use");
        // Set ABI
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Emit ABI added event
        emit ABIAdded(nameHash, block.timestamp);
    }

    /// @notice Get the total number of upgrade proposals
    function getTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoUpgradeNameSpace, "total")));
    }

    /// @notice Return the state of the specified upgrade proposal
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getState(uint256 _upgradeProposalID) override public view returns (UpgradeProposalState) {
        // Check the proposal ID is legit
        require(getTotal() >= _upgradeProposalID && _upgradeProposalID > 0, "Invalid upgrade proposal ID");
        if (getVetoed(_upgradeProposalID)) {
            return UpgradeProposalState.Vetoed;
        } else if (getExecuted(_upgradeProposalID)) {
            return UpgradeProposalState.Executed;
        } else if (block.timestamp < getEnd(_upgradeProposalID)) {
            return UpgradeProposalState.Pending;
        } else {
            return UpgradeProposalState.Succeeded;
        }
    }

    /// @notice Get the end time of this proposal (when the upgrade delay ends)
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getEnd(uint256 _upgradeProposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoUpgradeNameSpace, "end", _upgradeProposalID)));
    }

    /// @notice Get whether the proposal has been executed
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getExecuted(uint256 _upgradeProposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoUpgradeNameSpace, "executed", _upgradeProposalID)));
    }

    /// @notice Get whether the proposal has been vetoed
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getVetoed(uint256 _upgradeProposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoUpgradeNameSpace, "vetoed", _upgradeProposalID)));
    }

    /// @notice Get the proposal type
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getType(uint256 _upgradeProposalID) override public view returns (bytes32) {
        return getBytes32(keccak256(abi.encodePacked(daoUpgradeNameSpace, "type", _upgradeProposalID)));
    }

    /// @notice Get the proposed upgrade contract name
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getName(uint256 _upgradeProposalID) override public view returns (string memory) {
        return getString(keccak256(abi.encodePacked(daoUpgradeNameSpace, "name", _upgradeProposalID)));
    }

    /// @notice Get the proposed upgrade contract address
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getUpgradeAddress(uint256 _upgradeProposalID) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked(daoUpgradeNameSpace, "address", _upgradeProposalID)));
    }

    /// @notice Get the proposed upgrade contract ABI
    /// @param _upgradeProposalID ID of the upgrade proposal to query
    function getUpgradeABI(uint256 _upgradeProposalID) override public view returns (string memory) {
        return getString(keccak256(abi.encodePacked(daoUpgradeNameSpace, "abi", _upgradeProposalID)));
    }
}
