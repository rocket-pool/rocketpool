// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../../interface/rewards/claims/RocketClaimDAOInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";
import "../../../types/SettingType.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol";
import "../../../interface/network/RocketNetworkVotingInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";


// The protocol DAO Proposals - Placeholder contracts until DAO is implemented
contract RocketDAOProtocolProposals is RocketBase, RocketDAOProtocolProposalsInterface {

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant daoNameSpace = "dao.protocol.";

    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAOProtocol") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 2;
    }

    /*** Proposals **********************/

    function getProposalBlock(uint256 _proposalID) external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", _proposalID)));
    }

    // Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    // A general message can be passed by the proposer along with the calldata payload that can be executed if the proposal passes
    function propose(string memory _proposalMessage, bytes memory _payload, uint32 _blockNumber, Types.Node[] calldata _treeNodes) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) returns (uint256) {
        // Things could change in the time between generating the merkle tree and txn being mined, so allow slightly older block targets
        // TODO: Make this a parameter?
        require(_blockNumber > block.number - 32, "Block too old");
        // Calculate total voting power (and quorum) optimistically
        uint256 quorum = 0;
        for (uint256 i = 0; i < _treeNodes.length; i++) {
            quorum += _treeNodes[i].sum;
        }
        // TODO: Read this from a parameter
        quorum /= 2;
        // Create the proposal
        uint256 proposalID = _propose(_proposalMessage, quorum, _payload);
        // Add root to verifier so it can be challenged if incorrect
        RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
        rocketDAOProtocolVerifier.submitProposalRoot(proposalID, msg.sender, _blockNumber, _treeNodes);
        // Record block number which is required only for protocol DAO voting
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", proposalID)), uint256(_blockNumber));
        return proposalID;
    }

    function _propose(string memory _proposalMessage, uint256 quorum, bytes memory _payload) internal returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOProtocolSettingsProposalsInterface rocketDAOProtocolSettingsProposals = RocketDAOProtocolSettingsProposalsInterface(getContractAddress("rocketDAOProtocolSettingsProposals"));
        return daoProposal.add(msg.sender, "rocketDAOProtocolProposals", _proposalMessage, block.timestamp + rocketDAOProtocolSettingsProposals.getVoteDelayTime(), rocketDAOProtocolSettingsProposals.getVoteTime(), rocketDAOProtocolSettingsProposals.getExecuteTime(), quorum, _payload);
    }

    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        // Vote now, one vote per trusted node member
        uint32 block = uint32(getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", _proposalID))));
        daoProposal.vote(msg.sender, rocketNetworkVoting.getVotingPower(msg.sender, block), _proposalID, _support);
    }

    // Cancel a proposal
    function cancel(uint256 _proposalID) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }

    // Execute a proposal
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Execute now
        daoProposal.execute(_proposalID);
    }

    function destroy(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposals", address(this)) onlyLatestContract("rocketDAOProtocolVerifier", msg.sender) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel the proposal
        daoProposal.cancel(daoProposal.getProposer(_proposalID), _proposalID);
    }

    /*** Proposal - Settings ***************/

    // Set multiple settings in one proposal
    function proposalSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _data) override external onlyExecutingContracts() {
        // Check lengths of all arguments are the same
        require(_settingContractNames.length == _settingPaths.length && _settingPaths.length == _types.length && _types.length == _data.length, "Invalid parameters supplied");
        // Loop through settings
        for (uint256 i = 0; i < _settingContractNames.length; i++) {
            if (_types[i] == SettingType.UINT256) {
                uint256 value = abi.decode(_data[i], (uint256));
                proposalSettingUint(_settingContractNames[i], _settingPaths[i], value);
            } else if (_types[i] == SettingType.BOOL) {
                bool value = abi.decode(_data[i], (bool));
                proposalSettingBool(_settingContractNames[i], _settingPaths[i], value);
            } else if (_types[i] == SettingType.ADDRESS) {
                address value = abi.decode(_data[i], (address));
                proposalSettingAddress(_settingContractNames[i], _settingPaths[i], value);
            } else {
                revert("Invalid setting type");
            }
        }
    }

    // Change one of the current uint256 settings of the protocol DAO
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingUint(_settingPath, _value);
    }

    // Change one of the current bool settings of the protocol DAO
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingBool(_settingPath, _value);
    }

    // Change one of the current address settings of the protocol DAO
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingAddress(_settingPath, _value);
    }

    // Update a claimer for the rpl rewards, must specify a unique contract name that will be claiming from and a percentage of the rewards
    function proposalSettingRewardsClaimer(string memory _contractName, uint256 _perc) override external onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        // Update now
        rocketDAOProtocolSettingsRewards.setSettingRewardsClaimer(_contractName, _perc);
    }

    /// @notice Spend RPL from the DAO's treasury immediately
    /// @param _invoiceID Arbitrary string for book keeping
    /// @param _recipientAddress Address to receive the RPL
    /// @param _amount Amount of RPL to send
    function proposalTreasuryOneTimeSpend(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.spend(_invoiceID, _recipientAddress, _amount);
    }

    /// @notice Add a new recurring payment contract to the treasury
    /// @param _contractName A unique string to refer to this payment contract
    /// @param _recipientAddress Address to receive the periodic RPL
    /// @param _amountPerPeriod Amount of RPL to pay per period
    /// @param _periodLength Number of seconds between each period
    /// @param _startTime Timestamp of when payments should begin
    /// @param _numPeriods Number periods to pay, or zero for a never ending contract
    function proposalTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.newContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _startTime, _numPeriods);
    }

    /// @notice Modifies and existing recurring payment contract
    /// @param _contractName The unique string of the payment contract
    /// @param _recipientAddress New address to receive the periodic RPL
    /// @param _amountPerPeriod New amount of RPL to pay per period
    /// @param _periodLength New number of seconds between each period
    /// @param _numPeriods New number periods to pay, or zero for a never ending contract
    function proposalTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.updateContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods);
    }
}
