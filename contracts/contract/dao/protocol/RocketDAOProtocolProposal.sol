// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol";
import "../../../interface/network/RocketNetworkVotingInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityProposalsInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalInterface.sol";

/// @notice Manages protocol DAO proposals
contract RocketDAOProtocolProposal is RocketBase, RocketDAOProtocolProposalInterface {

    // Events
    event ProposalAdded(address indexed proposer, uint256 indexed proposalID, bytes payload, uint256 time);
    event ProposalVoted(uint256 indexed proposalID, address indexed voter, VoteDirection direction, uint256 votingPower, uint256 time);
    event ProposalVoteOverridden(uint256 indexed proposalID, address indexed delegate, address indexed voter, uint256 votingPower, uint256 time);
    event ProposalExecuted(uint256 indexed proposalID, address indexed executor, uint256 time);
    event ProposalFinalised(uint256 indexed proposalID, address indexed executor, uint256 time);
    event ProposalDestroyed(uint256 indexed proposalID, uint256 time);

    // The namespace for any data stored in the protocol DAO (do not change)
    string constant internal daoProposalNameSpace = "dao.protocol.proposal.";

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /*** Proposals **********************/

    /// @notice Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    ///         A general message can be passed by the proposer along with the calldata payload that can be executed
    ///         if the proposal passes
    /// @param _proposalMessage A string explaining what the proposal does
    /// @param _payload An ABI encoded payload which is executed on this contract if the proposal is successful
    /// @param _blockNumber The block number the proposal is being made for
    /// @param _treeNodes A merkle pollard generated at _blockNumber for the voting power state of the DAO
    function propose(string memory _proposalMessage, bytes calldata _payload, uint32 _blockNumber, Types.Node[] calldata _treeNodes) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposal", address(this)) returns (uint256) {
        // Check on-chain governance has been enabled
        {
            uint256 enabledBlock = getUint(keccak256(abi.encodePacked("protocol.dao.enabled.block")));
            require(enabledBlock != 0 && _blockNumber >= enabledBlock, "DAO has not been enabled");
        }
        // Calculate total voting power by summing the pollard
        uint256 totalVotingPower = 0;
        uint256 treeNodesLength = _treeNodes.length;
        for (uint256 i = 0; i < treeNodesLength; ++i) {
            totalVotingPower += _treeNodes[i].sum;
        }
        // Create the proposal
        uint256 proposalID = _propose(_proposalMessage, _blockNumber, totalVotingPower, _payload);
        // Add root to verifier so it can be challenged if incorrect
        RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
        rocketDAOProtocolVerifier.submitProposalRoot(proposalID, msg.sender, _blockNumber, _treeNodes);
        return proposalID;
    }

    /// @notice Applies a vote during phase 1
    /// @param _proposalID ID of the proposal to vote on
    /// @param _voteDirection Direction of the vote
    /// @param _votingPower Total delegated voting power for the voter at the proposal block
    /// @param _nodeIndex The index of the node voting
    /// @param _witness A merkle proof into the network voting power tree proving the supplied voting power is correct
    function vote(uint256 _proposalID, VoteDirection _voteDirection, uint256 _votingPower, uint256 _nodeIndex, Types.Node[] calldata _witness) external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposal", address(this)) {
        // Check valid vote
        require(_voteDirection != VoteDirection.NoVote, "Invalid vote");
        // Check the proposal is in a state that can be voted on
        require(getState(_proposalID) == ProposalState.ActivePhase1, "Phase 1 voting is not active");
        // Verify the voting power is correct
        RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
        require(rocketDAOProtocolVerifier.verifyVote(msg.sender, _nodeIndex, _proposalID, _votingPower, _witness), "Invalid proof");
        // Apply vote
        _vote(msg.sender, _votingPower, _proposalID, _voteDirection, true);
    }

    /// @notice Applies a vote during phase 2 (can be used to override vote direction of delegate)
    /// @param _proposalID ID of the proposal to vote on
    /// @param _voteDirection Direction of the vote
    function overrideVote(uint256 _proposalID, VoteDirection _voteDirection) override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAOProtocolProposal", address(this)) {
        // Check valid vote
        require(_voteDirection != VoteDirection.NoVote, "Invalid vote");
        // Check the proposal is in a state that can be voted on
        require(getState(_proposalID) == ProposalState.ActivePhase2, "Phase 2 voting is not active");
        // Load contracts
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        // Get caller's voting power and direction of their delegate
        uint32 blockNumber = uint32(getProposalBlock(_proposalID));
        uint256 votingPower = rocketNetworkVoting.getVotingPower(msg.sender, blockNumber);
        address delegate = rocketNetworkVoting.getDelegate(msg.sender, blockNumber);
        // Check if delegate voted in phase 1
        if (getReceiptHasVotedPhase1(_proposalID, delegate)) {
            // Get the vote direction of their delegate
            VoteDirection delegateVote = getReceiptDirection(_proposalID, delegate);
            require (delegateVote != _voteDirection, "Vote direction is the same as delegate");
            // Reverse the delegate's vote
            _overrideVote(delegate, msg.sender, _proposalID, votingPower, delegateVote);
        }
        // Apply this voter's vote
        _vote(msg.sender, votingPower, _proposalID, _voteDirection, false);
    }

    /// @notice Finalises a vetoed proposal by burning the proposer's bond
    /// @param _proposalID ID of the proposal to finalise
    function finalise(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposal", address(this)) {
        // Check state
        require(getState(_proposalID) == ProposalState.Vetoed, "Proposal has not been vetoed");
        bytes32 finalisedKey = keccak256(abi.encodePacked(daoProposalNameSpace, "finalised", _proposalID));
        require(getBool(finalisedKey) == false, "Proposal already finalised");
        setBool(finalisedKey, true);
        // Burn the proposer's bond
        RocketDAOProtocolVerifierInterface rocketDAOProtocolVerifier = RocketDAOProtocolVerifierInterface(getContractAddress("rocketDAOProtocolVerifier"));
        rocketDAOProtocolVerifier.burnProposalBond(_proposalID);
        // Log it
        emit ProposalFinalised(_proposalID, tx.origin, block.timestamp);
    }

    /// @notice Executes a successful proposal
    /// @param _proposalID ID of the proposal to execute
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposal", address(this)) {
        // Firstly make sure this proposal has passed
        require(getState(_proposalID) == ProposalState.Succeeded, "Proposal has not succeeded, has expired or has already been executed");
        // Set as executed now before running payload
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "executed", _proposalID)), true);
        // Get the proposals contract
        address daoProtocolProposalsAddress = getContractAddress("rocketDAOProtocolProposals");
        // Ok all good, lets run the payload on the dao contract that the proposal relates too, it should execute one of the methods on this contract
        (bool success, bytes memory response) = daoProtocolProposalsAddress.call(getPayload(_proposalID));
        // Was there an error?
        require(success, getRevertMsg(response));
        // Log it
        emit ProposalExecuted(_proposalID, tx.origin, block.timestamp);
    }

    /// @dev Called by the verifier contract to destroy a proven invalid proposal
    function destroy(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposal", address(this)) onlyLatestContract("rocketDAOProtocolVerifier", msg.sender) {
        // Cancel the proposal
        bytes32 destroyedKey = keccak256(abi.encodePacked(daoProposalNameSpace, "destroyed", _proposalID));
        require(getBool(destroyedKey) == false, "Proposal already destroyed");
        setBool(destroyedKey, true);
        // Log it
        emit ProposalDestroyed(_proposalID, block.timestamp);
    }

    /// @notice Gets the block used to generate a proposal
    /// @param _proposalID The ID of the proposal to query
    /// @return The block used to generated the requested proposal
    function getProposalBlock(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "proposal.block", _proposalID)));
    }

    /// @notice Gets the amount of vetos required to stop a proposal
    /// @param _proposalID The ID of the proposal to veto
    /// @return The amount of voting power required to veto a proposal
    function getProposalVetoQuorum(uint256 _proposalID) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "proposal.veto.quorum", _proposalID)));
    }

    /// @notice Get the current total proposals
    function getTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "total")));
    }

    /// @notice Get the member who proposed
    /// @param _proposalID The ID of the proposal to query
    function getProposer(uint256 _proposalID) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked(daoProposalNameSpace, "proposer", _proposalID)));
    }

    /// @notice Get the proposal message
    /// @param _proposalID The ID of the proposal to query
    function getMessage(uint256 _proposalID) override external view returns (string memory) {
        return getString(keccak256(abi.encodePacked(daoProposalNameSpace, "message", _proposalID)));
    }

    /// @notice Get the start of this proposal as a timestamp
    /// @param _proposalID The ID of the proposal to query
    function getStart(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "start", _proposalID)));
    }

    /// @notice Get the end of phase1 of this proposal as a timestamp
    /// @param _proposalID The ID of the proposal to query
    function getPhase1End(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "phase1End", _proposalID)));
    }

    /// @notice Get the end of phase2 of this proposal as a timestamp
    /// @param _proposalID The ID of the proposal to query
    /// @return timestamp for the end of phase2
    function getPhase2End(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "phase2End", _proposalID)));
    }

    /// @notice The timestamp where the proposal expires and can no longer be executed if it is successful
    /// @param _proposalID The ID of the proposal to query
    function getExpires(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "expires", _proposalID)));
    }

    /// @notice Get the created status of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getCreated(uint256 _proposalID) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "created", _proposalID)));
    }

    /// @notice Get the for voting power count of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVotingPowerFor(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", _proposalID)));
    }

    /// @notice Get the against voting power count of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVotingPowerAgainst(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", _proposalID)));
    }

    /// @notice Get the veto voting power  count of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVotingPowerVeto(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.veto", _proposalID)));
    }

    /// @notice Get the against voteing power count of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVotingPowerAbstained(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.abstained", _proposalID)));
    }

    /// @notice How much voting power is required for the proposal to succeed
    /// @param _proposalID The ID of the proposal to query
    function getVotingPowerRequired(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.required", _proposalID)));
    }

    /// @notice Get the destroyed status of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getDestroyed(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "destroyed", _proposalID)));
    }

    /// @notice Get the finalised status of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getFinalised(uint256 _proposalID) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "finalised", _proposalID)));
    }

    /// @notice Get the executed status of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getExecuted(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "executed", _proposalID)));
    }

    /// @notice Get the amount of veto votes required to veto this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVetoQuorum(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "proposal.veto.quorum", _proposalID)));
    }

    /// @notice Get the veto status of this proposal
    /// @param _proposalID The ID of the proposal to query
    function getVetoed(uint256 _proposalID) override public view returns (bool) {
        uint256 votesVeto = getVotingPowerVeto(_proposalID);
        uint256 quorum = getVetoQuorum(_proposalID);
        return votesVeto >= quorum;
    }

    /// @notice Get the proposal payload
    /// @param _proposalID The ID of the proposal to query
    function getPayload(uint256 _proposalID) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked(daoProposalNameSpace, "payload", _proposalID)));
    }

    /// @notice Returns true if this proposal has already been voted on by a node
    /// @param _proposalID The ID of the proposal to query
    /// @param _nodeAddress The node operator address to query
    function getReceiptHasVoted(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getReceiptDirection(_proposalID, _nodeAddress) != VoteDirection.NoVote;
    }

    /// @notice Returns true if this proposal has been voted on in phase 1 by a node
    /// @param _proposalID The ID of the proposal to query
    /// @param _nodeAddress The node operator address to query
    function getReceiptHasVotedPhase1(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.phase1", _proposalID, _nodeAddress)));
    }

    /// @notice Returns the direction a node voted on a given proposal
    /// @param _proposalID The ID of the proposal to query
    /// @param _nodeAddress The node operator address to query
    function getReceiptDirection(uint256 _proposalID, address _nodeAddress) override public view returns (VoteDirection) {
        return VoteDirection(getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.direction", _proposalID, _nodeAddress))));
    }

    /// @notice Return the state of the specified proposal
    /// @param _proposalID The ID of the proposal to query
    function getState(uint256 _proposalID) override public view returns (ProposalState) {
        // Check the proposal ID is legit
        require(getTotal() >= _proposalID && _proposalID > 0, "Invalid proposal ID");
        // Destroyed?
        if (getDestroyed(_proposalID)) {
            return ProposalState.Destroyed;
        }
        // Has it been executed?
        else if (getExecuted(_proposalID)) {
            return ProposalState.Executed;
        } else {
            uint256 start = getStart(_proposalID);
            // Is the proposal pending?
            if (block.timestamp < start) {
                return ProposalState.Pending;
            } else {
                // The proposal is active and can be voted on
                uint256 phase1End = getPhase1End(_proposalID);
                uint256 phase2End = getPhase2End(_proposalID);
                if (block.timestamp < phase1End) {
                    return ProposalState.ActivePhase1;
                } else if (block.timestamp < phase2End) {
                        return ProposalState.ActivePhase2;
                } else {
                    // Is the proposal vetoed?
                    if (getVetoed(_proposalID)) {
                        return ProposalState.Vetoed;
                    }

                    uint256 votesFor = getVotingPowerFor(_proposalID);
                    uint256 votesAgainst = getVotingPowerAgainst(_proposalID);
                    uint256 votesAbstained = getVotingPowerAbstained(_proposalID);
                    uint256 totalVotes = votesFor + votesAgainst + votesAbstained;

                    // Has the proposal reached quorum?
                    if (totalVotes >= getVotingPowerRequired(_proposalID)) {
                        if (votesFor > votesAgainst) {
                            if (block.timestamp < getExpires(_proposalID)) {
                                // Vote was successful, is now awaiting execution
                                return ProposalState.Succeeded;
                            }
                        } else {
                            // Vote was defeated
                            return ProposalState.Defeated;
                        }
                    } else {
                        return ProposalState.QuorumNotMet;
                    }
                }
            }
        }
        return ProposalState.Expired;
    }

    /// @dev Internal function to generate a proposal
    /// @param _proposalMessage the message associated with the proposal
    /// @param _blockNumber the block number considered for the proposal snapshot
    /// @param _totalVotingPower the total voting power for the proposal - used to calculate quorum
    /// @param _payload A calldata payload to execute after the proposal is successful
    /// @return The new proposal's ID
    function _propose(string memory _proposalMessage, uint256 _blockNumber, uint256 _totalVotingPower, bytes calldata _payload) internal returns (uint256) {
        // Validate block number
        require(_blockNumber < block.number, "Block must be in the past");
        // Load contracts
        RocketDAOProtocolSettingsProposalsInterface rocketDAOProtocolSettingsProposals = RocketDAOProtocolSettingsProposalsInterface(getContractAddress("rocketDAOProtocolSettingsProposals"));
        require(_blockNumber + rocketDAOProtocolSettingsProposals.getProposalMaxBlockAge() > block.number, "Block too old");
        // Calculate quorums
        uint256 quorum = 0;
        uint256 vetoQuorum = 0;
        {
            uint256 proposalQuorum = rocketDAOProtocolSettingsProposals.getProposalQuorum();
            uint256 vetoProposalQuorum = rocketDAOProtocolSettingsProposals.getProposalVetoQuorum();
            quorum = _totalVotingPower * proposalQuorum / calcBase;
            vetoQuorum = _totalVotingPower * vetoProposalQuorum / calcBase;
        }
        // Add proposal
        return _addProposal(
            msg.sender,
            _proposalMessage,
            _blockNumber,
            block.timestamp + rocketDAOProtocolSettingsProposals.getVoteDelayTime(),
            rocketDAOProtocolSettingsProposals.getVotePhase1Time(),
            rocketDAOProtocolSettingsProposals.getVotePhase2Time(),
            rocketDAOProtocolSettingsProposals.getExecuteTime(),
            quorum,
            vetoQuorum,
            _payload
        );
    }

    /// @dev Add a proposal to the protocol DAO
    function _addProposal(address _proposer, string memory _message, uint256 _blockNumber, uint256 _startTime, uint256 _phase1Duration, uint256 _phase2Duration, uint256 _expires, uint256 _votesRequired, uint256 _vetoQuorum, bytes calldata _payload) internal returns (uint256) {
        // Basic checks
        require(_startTime > block.timestamp, "Proposal start time must be in the future");
        require(_phase1Duration > 0, "Proposal cannot have a duration of 0");
        require(_phase2Duration > 0, "Proposal cannot have a duration of 0");
        require(_expires > 0, "Proposal cannot have a execution expiration of 0");
        require(_votesRequired > 0, "Proposal cannot have a 0 votes required to be successful");
        // Set the expires block
        uint256 expires = _startTime + _phase1Duration + _phase2Duration + _expires;
        // Get the proposal ID
        uint256 proposalID = getTotal() + 1;
        // The data structure for a proposal
        setAddress(keccak256(abi.encodePacked(daoProposalNameSpace, "proposer", proposalID)), _proposer);                   // Which node is making the proposal
        setString(keccak256(abi.encodePacked(daoProposalNameSpace, "message", proposalID)), _message);                      // A general message that can be included with the proposal
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "start", proposalID)), _startTime);                        // The time the proposal becomes active for voting on
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "phase1End", proposalID)), _startTime + _phase1Duration);  // The time the proposal where voting ends on phase 1
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "phase2End", proposalID)), _startTime + _phase1Duration + _phase2Duration); // The time the proposal where voting ends on phase 2
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "expires", proposalID)), expires);                         // The time when the proposal expires and can no longer be executed if it is successful
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "created", proposalID)), block.timestamp);                 // The time the proposal was created at
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.required", proposalID)), _votesRequired);           // How many votes are required for the proposal to pass
        setBytes(keccak256(abi.encodePacked(daoProposalNameSpace, "payload", proposalID)), _payload);                       // A calldata payload to execute after it is successful
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "proposal.block", proposalID)), uint256(_blockNumber));    // The block that the network voting power tree was generated for for this proposal
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "proposal.veto.quorum", proposalID)), _vetoQuorum);        // The number of veto votes required to veto this proposal
        // Update the total proposals
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "total")), proposalID);
        // Log it
        emit ProposalAdded(_proposer, proposalID, _payload, block.timestamp);
        // Done
        return proposalID;
    }

    /// @dev Internal method to override the vote of a delegate
    function _overrideVote(address _delegate, address _voter, uint256 _proposalID, uint256 _votes, VoteDirection _voteDirection) internal {
        // Check for non-zero voting power
        require(_votes > 0, "Cannot vote with 0 voting power");
        // Remove votes from proposal
        if (_voteDirection == VoteDirection.For) {
            subUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", _proposalID)), _votes);
        } else if(_voteDirection == VoteDirection.Abstain) {
            subUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.abstained", _proposalID)), _votes);
        } else {
            if(_voteDirection == VoteDirection.AgainstWithVeto) {
                subUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.veto", _proposalID)), _votes);
            }
            subUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", _proposalID)), _votes);
        }
        // Reduce the voting power applied by the delegate to this proposal
        subUint(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.votes", _proposalID, _delegate)), _votes);
        // Log it
        emit ProposalVoteOverridden(_proposalID, _delegate, _voter, _votes, block.timestamp);
    }

    /// @dev Internal method to apply voting power against a proposal
    function _vote(address _nodeOperator, uint256 _votes, uint256 _proposalID, VoteDirection _voteDirection, bool _phase1) internal {
        // Check for non-zero voting power
        require(_votes > 0, "Cannot vote with 0 voting power");
        // Has this node already voted on this proposal?
        require(!getReceiptHasVoted(_proposalID, _nodeOperator), "Node operator has already voted on proposal");
        // Add votes to proposal
        if (_voteDirection == VoteDirection.For) {
            addUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", _proposalID)), _votes);
        } else if(_voteDirection == VoteDirection.Abstain) {
            addUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.abstained", _proposalID)), _votes);
        } else {
            if(_voteDirection == VoteDirection.AgainstWithVeto) {
                addUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.veto", _proposalID)), _votes);
            }
            addUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", _proposalID)), _votes);
        }
        // Record the vote receipt now
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.votes", _proposalID, _nodeOperator)), _votes);
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.direction", _proposalID, _nodeOperator)), uint256(_voteDirection));
        // Record delegate voted in phase 1
        if (_phase1) {
            setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.phase1", _proposalID, _nodeOperator)), true);
        }
        // Log it
        emit ProposalVoted(_proposalID, _nodeOperator, _voteDirection, _votes, block.timestamp);
    }
}
