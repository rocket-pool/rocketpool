// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

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
import "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityProposalsInterface.sol";

/// @notice Manages protocol DAO proposals
contract RocketDAOProtocolProposals is RocketBase, RocketDAOProtocolProposalsInterface {

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant daoNameSpace = "dao.protocol.";

    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAOProtocol") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /*** Proposals **********************/

    /// @notice Gets the block used to generate a proposal
    /// @param _proposalID The ID of the proposal to query
    /// @return The block used to generated the requested proposal
    function getProposalBlock(uint256 _proposalID) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", _proposalID)));
    }

    /// @notice Gets the amount of vetos required to stop a proposal
    /// @param _proposalID The ID of the proposal to veto
    /// @return The amount of voting power required to veto a proposal
    function getProposalVetoQuorum(uint256 _proposalID) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.veto.quorum", _proposalID)));
    }

    /// @notice Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    ///         A general message can be passed by the proposer along with the calldata payload that can be executed
    ///         if the proposal passes
    /// @param _proposalMessage A string explaining what the proposal does
    /// @param _payload An ABI encoded payload which is executed on this contract if the proposal is successful
    /// @param _blockNumber The block number the proposal is being made for
    /// @param _treeNodes A merkle pollard generated at _blockNumber for the voting power state of the DAO
    function propose(string memory _proposalMessage, bytes memory _payload, uint32 _blockNumber, Types.Node[] calldata _treeNodes) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) returns (uint256) {
        // Things could change in the time between generating the merkle tree and txn being mined, so allow slightly older block targets
        RocketDAOProtocolSettingsProposalsInterface rocketDAOProtocolSettingsProposals = RocketDAOProtocolSettingsProposalsInterface(getContractAddress("rocketDAOProtocolSettingsProposals"));
        require(_blockNumber + rocketDAOProtocolSettingsProposals.getProposalMaxBlockAge() > block.number, "Block too old");
        uint256 quorum = 0;
        uint256 vetoQuorum = 0;
        {
            // Calculate total voting power (and quorum) optimistically
            uint256 totalVotingPower = 0;
            for (uint256 i = 0; i < _treeNodes.length; i++) {
                totalVotingPower += _treeNodes[i].sum;
            }
            uint256 proposalQuorum = rocketDAOProtocolSettingsProposals.getProposalQuorum();
            quorum = totalVotingPower * proposalQuorum / calcBase;
            uint256 vetoProposalQuorum = rocketDAOProtocolSettingsProposals.getProposalVetoQuorum();
            vetoQuorum = totalVotingPower * vetoProposalQuorum / calcBase;
        }
        // Create the proposal
        uint256 proposalID = _propose(_proposalMessage, quorum, _payload);
        // Add root to verifier so it can be challenged if incorrect
        RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
        rocketDAOProtocolVerifier.submitProposalRoot(proposalID, msg.sender, _blockNumber, _treeNodes);
        // Record block number which is required only for protocol DAO voting
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", proposalID)), uint256(_blockNumber));
        // Store the veto quorum which is required only for protocol DAO voting
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.veto.quorum", proposalID)), vetoQuorum);
        return proposalID;
    }

    /// @dev Internal function to generate a proposal
    /// @return The new proposal's ID
    function _propose(string memory _proposalMessage, uint256 _quorum, bytes memory _payload) internal returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOProtocolSettingsProposalsInterface rocketDAOProtocolSettingsProposals = RocketDAOProtocolSettingsProposalsInterface(getContractAddress("rocketDAOProtocolSettingsProposals"));
        return daoProposal.add(msg.sender, "rocketDAOProtocolProposals", _proposalMessage, block.timestamp + rocketDAOProtocolSettingsProposals.getVoteDelayTime(), rocketDAOProtocolSettingsProposals.getVoteTime(), rocketDAOProtocolSettingsProposals.getExecuteTime(), _quorum, _payload);
    }

    /// @notice Vote on a proposal
    /// @param _proposalID ID of the proposal to vote on
    /// @param _support True if supporting the proposal, false otherwise
    function vote(uint256 _proposalID, bool _support) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        // Vote now, one vote per trusted node member
        uint32 blockNumber = uint32(getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", _proposalID))));
        daoProposal.vote(msg.sender, rocketNetworkVoting.getVotingPower(msg.sender, blockNumber), _proposalID, _support);
    }

    /// @notice Votes against a proposal and adds to the veto quorum
    /// @param _proposalID ID of the proposal to vote on
    function veto(uint256 _proposalID) onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposals", address(this)) external {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        // Get proposal block and user voting power
        uint32 blockNumber = uint32(getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.block", _proposalID))));
        uint256 votingPower = rocketNetworkVoting.getVotingPower(msg.sender, blockNumber);
        // Vote against the proposal (checks valid proposal status and user already voted)
        daoProposal.vote(msg.sender, votingPower, _proposalID, false);
        // Increment the veto power
        bytes32 vetoKey = keccak256(abi.encodePacked(daoNameSpace, "votes.veto", _proposalID));
        uint256 vetoPower = getUint(vetoKey);
        setUint(vetoKey, vetoPower + votingPower);
        // Check for successful veto
        uint256 vetoQuorum = getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.veto.quorum", _proposalID)));
        if (vetoPower >= vetoQuorum) {
            // Cancel the proposal
            daoProposal.cancel(daoProposal.getProposer(_proposalID), _proposalID);
            // Burn the proposer's bond
            RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
            rocketDAOProtocolVerifier.burnProposalBond(_proposalID);
        }
    }

    /// @notice Executes a successful proposal
    /// @param _proposalID ID of the proposal to execute
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Execute now
        daoProposal.execute(_proposalID);
    }

    /// @dev Called by the verifier contract to destroy a proven invalid proposal
    function destroy(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposals", address(this)) onlyLatestContract("rocketDAOProtocolVerifier", msg.sender) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel the proposal
        daoProposal.cancel(daoProposal.getProposer(_proposalID), _proposalID);
    }

    /*** Proposal - Settings ***************/

    /// @notice Set multiple settings in one proposal. It is required that all input arrays are the same length.
    /// @param _settingContractNames An array of contract names
    /// @param _settingPaths An array of setting paths
    /// @param _types An array of the type of values to set
    /// @param _data An array of ABI encoded values to set
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

    /// @notice Change one of the current uint256 settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingUint(_settingPath, _value);
    }

    /// @notice Change one of the current bool settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingBool(_settingPath, _value);
    }

    /// @notice Change one of the current address settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAOProtocolSettings.setSettingAddress(_settingPath, _value);
    }

    /// @notice Updates the percentages the trusted nodes use when calculating RPL reward trees. Percentages must add up to 100%
    /// @param _trustedNodePercent The percentage of rewards paid to the trusted node set (as a fraction of 1e18)
    /// @param _protocolPercent The percentage of rewards paid to the protocol dao (as a fraction of 1e18)
    /// @param _nodePercent The percentage of rewards paid to the node operators (as a fraction of 1e18)
    function proposalSettingRewardsClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) override external onlyExecutingContracts() {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        // Update now
        rocketDAOProtocolSettingsRewards.setSettingRewardsClaimers(_trustedNodePercent, _protocolPercent, _nodePercent);
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

    /// @notice Invites an address to join the security council
    /// @param _id A string to identify this member with
    /// @param _memberAddress The address of the new member
    function proposalSecurityInvite(string memory _id, address _memberAddress) override external onlyExecutingContracts() {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalInvite(_id, _memberAddress);
    }

    /// @notice Propose to kick a current member from the security council
    /// @param _memberAddress The address of the member to kick
    function proposalSecurityKick(address _memberAddress) override external onlyExecutingContracts {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalKick(_memberAddress);
    }
}
