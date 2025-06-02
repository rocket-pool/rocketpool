// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol";
import "../../../interface/network/RocketNetworkVotingInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "@openzeppelin4/contracts/utils/math/Math.sol";
import "../../../interface/token/RocketTokenRPLInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/node/RocketNodeStakingInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalInterface.sol";

/// @notice Implements the protocol DAO optimistic fraud proof proposal system
contract RocketDAOProtocolVerifier is RocketBase, RocketDAOProtocolVerifierInterface {

    uint256 constant internal depthPerRound = 5;

    // Packing constants for packing challenge data into a single uint256
    uint256 constant internal stateOffset = (256 - 8);
    uint256 constant internal timestampOffset = (256 - 8 - 64);
    uint256 constant internal addressOffset = (256 - 8 - 64 - 160);

    // Offsets into storage for proposal details
    uint256 constant internal proposerOffset = 0;
    uint256 constant internal blockNumberOffset = 1;
    uint256 constant internal nodeCountOffset = 2;
    uint256 constant internal defeatIndexOffset = 3;
    uint256 constant internal proposalBondOffset = 4;
    uint256 constant internal challengeBondOffset = 5;
    uint256 constant internal challengePeriodOffset = 6;

    // Offsets into storage for challenge details
    uint256 constant internal challengeStateOffset = 0;
    uint256 constant internal sumOffset = 1;
    uint256 constant internal hashOffset = 2;

    // Burn rate
    uint256 constant internal bondBurnPercent = 0.2 ether;

    // Events
    event RootSubmitted(uint256 indexed proposalID, address indexed proposer, uint32 blockNumber, uint256 index, Types.Node root, Types.Node[] treeNodes, uint256 timestamp);
    event ChallengeSubmitted(uint256 indexed proposalID, address indexed challenger, uint256 index, uint256 timestamp);
    event ProposalBondBurned(uint256 indexed proposalID, address indexed proposer, uint256 amount, uint256 timestamp);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 2;
    }

    /// @notice Returns the depth per round
    function getDepthPerRound() override external pure returns (uint256) {
        return depthPerRound;
    }

    /// @notice Returns the defeat index for this proposal
    /// @param _proposalID The proposal to fetch details
    function getDefeatIndex(uint256 _proposalID) override external view returns (uint256) {
        // Fetch the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        return getUint(bytes32(proposalKey + defeatIndexOffset));
    }

    /// @notice Returns the proposal bond for this proposal
    /// @param _proposalID The proposal to fetch details
    function getProposalBond(uint256 _proposalID) override external view returns (uint256) {
        // Fetch the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        return getUint(bytes32(proposalKey + proposalBondOffset));
    }

    /// @notice Returns the challenge bond for this proposal
    /// @param _proposalID The proposal to fetch details
    function getChallengeBond(uint256 _proposalID) override external view returns (uint256) {
        // Fetch the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        return getUint(bytes32(proposalKey + challengeBondOffset));
    }

    /// @notice Returns the duration of the challenge period for this proposal
    /// @param _proposalID The proposal to fetch details
    function getChallengePeriod(uint256 _proposalID) override external view returns (uint256) {
        // Fetch the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        return getUint(bytes32(proposalKey + challengePeriodOffset));
    }

    /// @dev Called during a proposal submission to calculate and store the proposal root so it is available for challenging
    /// @param _proposalID The ID of the proposal
    /// @param _proposer The node raising the proposal
    /// @param _blockNumber The block number used to generate the voting power tree
    /// @param _treeNodes A pollard of the voting power tree
    function submitProposalRoot(uint256 _proposalID, address _proposer, uint32 _blockNumber, Types.Node[] calldata _treeNodes) external onlyLatestContract("rocketDAOProtocolProposal", msg.sender) onlyLatestContract("rocketDAOProtocolVerifier", address(this)) {
        // Retrieve the node count at _blockNumber
        uint256 nodeCount;
        {
            RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
            nodeCount = rocketNetworkVoting.getNodeCount(_blockNumber);
        }

        // Verify proposer supplied correct number of nodes for the pollard
        {
            uint256 maxDepth = getMaxDepth(nodeCount);

            if (maxDepth < depthPerRound) {
                uint256 leafCount = 2 ** maxDepth;
                require(_treeNodes.length == leafCount, "Invalid node count");
            } else {
                require(_treeNodes.length == 2 ** depthPerRound, "Invalid node count");
            }
        }

        // Compute the proposal root from the supplied nodes
        Types.Node memory root = computeRootFromNodes(_treeNodes);

        {
            RocketDAOProtocolSettingsProposalsInterface rocketDAOProtocolSettingsProposals = RocketDAOProtocolSettingsProposalsInterface(getContractAddress("rocketDAOProtocolSettingsProposals"));

            // Get the current proposal bond amount
            uint256 proposalBond = rocketDAOProtocolSettingsProposals.getProposalBond();

            // Lock the proposal bond (will revert if proposer doesn't have enough effective RPL staked)
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            rocketNodeStaking.lockRPL(_proposer, proposalBond);

            // Store proposal details
            uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
            setAddress(bytes32(proposalKey + proposerOffset), _proposer);
            setUint(bytes32(proposalKey + blockNumberOffset), _blockNumber);
            setUint(bytes32(proposalKey + nodeCountOffset), nodeCount);
            setUint(bytes32(proposalKey + proposalBondOffset), proposalBond);
            setUint(bytes32(proposalKey + challengeBondOffset), rocketDAOProtocolSettingsProposals.getChallengeBond());
            setUint(bytes32(proposalKey + challengePeriodOffset), rocketDAOProtocolSettingsProposals.getChallengePeriod());
        }

        // The root was supplied so mark that index (1) as responded and store the node
        setNode(_proposalID, 1, root);
        uint256 state = uint256(Types.ChallengeState.Responded) << stateOffset;
        state |= block.timestamp << timestampOffset;
        setUint(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, uint256(1))), state);

        // Emit event
        emit RootSubmitted(_proposalID, _proposer, _blockNumber, 1, root, _treeNodes, block.timestamp);
    }

    /// @dev Called by proposal contract to burn the bond of the proposer after a successful veto
    /// @param _proposalID the proposal ID that will have the bond burnt
    function burnProposalBond(uint256 _proposalID) override external onlyLatestContract("rocketDAOProtocolProposal", address(msg.sender)) onlyLatestContract("rocketDAOProtocolVerifier", address(this)) {
        // Retrieved required inputs from storage
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        address proposer = getAddress(bytes32(proposalKey + proposerOffset));
        uint256 proposalBond = getUint(bytes32(proposalKey + proposalBondOffset));
        // Unlock and burn
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStaking.unlockRPL(proposer, proposalBond);
        rocketNodeStaking.burnRPL(proposer, proposalBond);
        // Log it
        emit ProposalBondBurned(_proposalID, proposer, proposalBond, block.timestamp);
    }

    /// @notice Used by a verifier to challenge a specific index of a proposal's voting power tree
    /// @param _proposalID The ID of the proposal being challenged
    /// @param _index The global index of the node being challenged
    /// @param _node The node that is being challenged as submitted by the proposer
    /// @param _witness A merkle proof of the challenged node (using the previously challenged index as a root)
    function createChallenge(uint256 _proposalID, uint256 _index, Types.Node calldata _node, Types.Node[] calldata _witness) external onlyLatestContract("rocketDAOProtocolVerifier", address(this)) onlyRegisteredNode(msg.sender) {
        {  // Scope to prevent stack too deep
            // Check whether the proposal is on the Pending state
            RocketDAOProtocolProposalInterface daoProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
            RocketDAOProtocolProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState == RocketDAOProtocolProposalInterface.ProposalState.Pending, "Can only challenge while proposal is Pending");
        }
        // Precompute the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));

        // Retrieve the node count of this proposal
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
        uint256 maxDepth = getMaxDepth(nodeCount);
        {
            // Check depth doesn't exceed the extended tree
            uint256 depth = getDepthFromIndex(_index);
            require(depth < maxDepth * 2, "Invalid index depth");
        }

        // Check for existing challenge against this index
        {
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
            uint256 challengeData = getUint(challengeKey);
            require(challengeData == 0, "Index already challenged");
            // Write challenge
            challengeData = uint256(Types.ChallengeState.Challenged) << stateOffset;
            challengeData |= block.timestamp << timestampOffset;
            challengeData |= uint256(uint160(msg.sender)) << addressOffset;
            setUint(challengeKey, challengeData);
        }

        // Check the proposal hasn't already been defeated
        require(getUint(bytes32(proposalKey+defeatIndexOffset)) == 0, "Proposal already defeated");

        // Verify the validity of the challenge proof
        {
            // Check depth is exactly one round deeper than a previous challenge (or the proposal root)
            uint256 previousIndex = getPollardRootIndex(_index, nodeCount);
            require(_getChallengeState(getUint(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, previousIndex)))) == Types.ChallengeState.Responded, "Invalid challenge depth");

            // Check the proof contains the expected number of nodes
            require(_witness.length == getDepthFromIndex(_index) - getDepthFromIndex(previousIndex), "Invalid proof length");

            // Get expected node and compute provided root node then compare
            Types.Node memory _expected = getNode(_proposalID, previousIndex);
            Types.Node memory rootFromWitness = computeRootFromWitness(_index, _node, _witness);
            require(rootFromWitness.hash == _expected.hash, "Invalid hash");
            require(rootFromWitness.sum == _expected.sum, "Invalid sum");

            // Store the node
            setNode(_proposalID, _index, _node);
        }

        // Lock the challenger's bond (reverts if not enough effective RPL)
        {
            uint256 challengeBond = getUint(bytes32(proposalKey + challengeBondOffset));
            RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
            rocketNodeStaking.lockRPL(msg.sender, challengeBond);
        }

        // Emit event
        emit ChallengeSubmitted(_proposalID, msg.sender, _index, block.timestamp);
    }

    /// @notice Can be called if proposer fails to respond to a challenge within the required time limit. Destroys the proposal if successful
    /// @param _proposalID The ID of the challenged proposal
    /// @param _index The index which was failed to respond to
    function defeatProposal(uint256 _proposalID, uint256 _index) external onlyLatestContract("rocketDAOProtocolVerifier", address(this)) onlyRegisteredNode(msg.sender) {
        {  // Scope to prevent stack too deep
            // Check whether the proposal is in the Pending state
            RocketDAOProtocolProposalInterface daoProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
            RocketDAOProtocolProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState == RocketDAOProtocolProposalInterface.ProposalState.Pending, "Can not defeat a valid proposal");
        }

        // Check the challenge at the given index has not been responded to
        bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
        uint256 data = getUint(challengeKey);
        Types.ChallengeState state = _getChallengeState(data);
        require(state == Types.ChallengeState.Challenged, "Invalid challenge state");

        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));

        // Precompute defeat index key
        bytes32 defeatIndexKey = bytes32(proposalKey+defeatIndexOffset);
        uint256 challengePeriod = getUint(bytes32(proposalKey + challengePeriodOffset));

        // Check the proposal hasn't already been defeated
        uint256 defeatIndex = getUint(defeatIndexKey);
        require(defeatIndex == 0, "Proposal already defeated");

        // Check enough time has passed
        uint256 timestamp = getChallengeTimestamp(data);
        require(block.timestamp > timestamp + challengePeriod, "Not enough time has passed");

        // Destroy the proposal
        RocketDAOProtocolProposalInterface rocketDAOProtocolProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
        rocketDAOProtocolProposal.destroy(_proposalID);

        // Record the winning index for reward payments
        setUint(defeatIndexKey, _index);
    }

    /// @notice Called by a challenger to claim bonds (both refunded bonds and any rewards paid minus the 20% bond burn)
    /// @param _proposalID The ID of the proposal
    /// @param _indices An array of indices which the challenger has a claim against
    function claimBondChallenger(uint256 _proposalID, uint256[] calldata _indices) external onlyLatestContract("rocketDAOProtocolVerifier", address(this)) onlyRegisteredNode(msg.sender) {
        {  // Scope to prevent stack too deep
            // Check whether the proposal is NOT on the Pending state
            RocketDAOProtocolProposalInterface daoProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
            RocketDAOProtocolProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState != RocketDAOProtocolProposalInterface.ProposalState.Pending, "Can not claim bond while proposal is Pending");
        }
        // Check whether the proposal was defeated
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));
        bool defeated = defeatIndex != 0;

        // Keep track of the number of indices the claimer had which were involved in defeating the proposal
        uint256 rewardedIndices = 0;

        for (uint256 i = 0; i < _indices.length; ++i) {
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _indices[i]));
            uint256 challengeData = getUint(challengeKey);
            Types.ChallengeState challengeState = _getChallengeState(challengeData);

            if (defeated) {
                // Refund all challenges if the proposal was defeated
                require(challengeState == Types.ChallengeState.Responded || challengeState == Types.ChallengeState.Challenged, "Invalid challenge state");
            } else {
                // Only refund non-responded challenges if the proposal wasn't defeated
                require(challengeState == Types.ChallengeState.Challenged, "Invalid challenge state");
            }

            // Check the challenger is the caller
            address challenger = address(uint160(challengeData >> addressOffset));
            require(msg.sender == challenger, "Invalid challenger");

            // Increment reward indices if required
            if (isRewardedIndex(defeatIndex, _indices[i])) {
                rewardedIndices++;
            }

            // Mark index as paid
            challengeData = setChallengeState(challengeData, Types.ChallengeState.Paid);
            setUint(challengeKey, challengeData);
        }

        // Get staking contract
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));

        // Unlock challenger bond
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        uint256 challengeBond = getUint(bytes32(proposalKey + challengeBondOffset));
        uint256 totalBond = _indices.length * challengeBond;
        rocketNodeStaking.unlockRPL(msg.sender, totalBond);

        // Pay challenger their reward
        if (rewardedIndices > 0) {
            uint256 proposalBond = getUint(bytes32(proposalKey + proposalBondOffset));
            // Calculate the number of challenges involved in defeating the proposal
            uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
            uint256 totalDefeatingIndices = getRoundsFromIndex(defeatIndex, nodeCount);
            uint256 totalReward = proposalBond * rewardedIndices / totalDefeatingIndices;
            uint256 burnAmount = totalReward * bondBurnPercent / calcBase;
            // Unlock the reward amount from the proposer and transfer it to the challenger
            address proposer = getAddress(bytes32(proposalKey + proposerOffset));
            rocketNodeStaking.unlockRPL(proposer, totalReward);
            rocketNodeStaking.burnRPL(proposer, burnAmount);
            rocketNodeStaking.transferRPL(proposer, msg.sender, totalReward - burnAmount);
        }
    }

    /// @notice Called by a proposer to claim bonds (both refunded bond and any rewards paid minus the 20% bond burn)
    /// @param _proposalID The ID of the proposal
    /// @param _indices An array of indices which the proposer has a claim against
    function claimBondProposer(uint256 _proposalID, uint256[] calldata _indices) external onlyLatestContract("rocketDAOProtocolVerifier", address(this)) onlyRegisteredNode(msg.sender) {
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));

        // Proposer has nothing to claim if their proposal was defeated
        require(defeatIndex == 0, "Proposal defeated");

        // Check the proposal has passed the waiting period and the voting period and wasn't cancelled
        {
            RocketDAOProtocolProposalInterface daoProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
            RocketDAOProtocolProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState >= RocketDAOProtocolProposalInterface.ProposalState.QuorumNotMet, "Invalid proposal state");
        }

        address proposer;
        uint256 challengeBond;
        uint256 proposalBond;
        {
            uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
            proposer = getAddress(bytes32(proposalKey + proposerOffset));
            // Only the proposer can call
            require(msg.sender == proposer, "Not proposer");
            // Query proposal bond params
            challengeBond = getUint(bytes32(proposalKey + challengeBondOffset));
            proposalBond = getUint(bytes32(proposalKey + proposalBondOffset));
        }

        // Get staking contract
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));

        uint256 burnPerChallenge = challengeBond * bondBurnPercent / calcBase;

        for (uint256 i = 0; i < _indices.length; ++i) {
            // Check the challenge of the given index was responded to
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _indices[i]));
            uint256 state = getUint(challengeKey);

            // Proposer can only claim the reward on indices they responded to
            require(_getChallengeState(state) == Types.ChallengeState.Responded, "Invalid challenge state");

            // Mark index as paid
            state = setChallengeState(state, Types.ChallengeState.Paid);
            setUint(challengeKey, state);

            // If claiming the root at this stage, then we return the proposal bond
            if (_indices[i] == 1) {
                rocketNodeStaking.unlockRPL(proposer, proposalBond);
            } else {
                // Unlock the challenger bond and pay to proposer
                address challenger = getChallengeAddress(state);
                rocketNodeStaking.unlockRPL(challenger, challengeBond);
                rocketNodeStaking.transferRPL(challenger, proposer, challengeBond - burnPerChallenge);
                rocketNodeStaking.burnRPL(challenger, burnPerChallenge);
            }
        }
    }

    /// @notice Used by a proposer to defend a challenged index
    /// @param _proposalID The ID of the proposal
    /// @param _index The global index of the node for which the proposer is submitting a new pollard
    /// @param _nodes A list of nodes making up the new pollard
    function submitRoot(uint256 _proposalID, uint256 _index, Types.Node[] calldata _nodes) external onlyLatestContract("rocketDAOProtocolVerifier", address(this)) onlyRegisteredNode(msg.sender) {
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));

        {  // Scope to prevent stack too deep
            // Check whether the proposal is in the Pending state
            RocketDAOProtocolProposalInterface daoProposal = RocketDAOProtocolProposalInterface(getContractAddress("rocketDAOProtocolProposal"));
            RocketDAOProtocolProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState == RocketDAOProtocolProposalInterface.ProposalState.Pending, "Can not submit root for a valid proposal");
            address proposer = getAddress(bytes32(proposalKey + proposerOffset));
            require(msg.sender == proposer, "Not proposer");
        }
        {  // Scope to prevent stack too deep
            // Get challenge state
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
            uint256 state = getUint(challengeKey);

            // Make sure this index was actually challenged
            require(_getChallengeState(state) == Types.ChallengeState.Challenged, "Challenge does not exist");

            // Mark the index as responded
            state = setChallengeState(state, Types.ChallengeState.Responded);
            setUint(challengeKey, state);
        }
        // Check the proposal hasn't already been defeated
        require(getUint(bytes32(proposalKey + defeatIndexOffset)) == 0, "Proposal already defeated");

        // Verify correct number of nodes in the pollard
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
        uint256 indexDepth = Math.log2(_index, Math.Rounding.Down);
        require(_nodes.length == 2 ** (getNextDepth(_index, nodeCount) - indexDepth), "Invalid node count");

        Types.Node memory expected = getNode(_proposalID, _index);
        Types.Node memory actual = computeRootFromNodes(_nodes);

        // Check that the supplied nodes sum to the expected value
        require(expected.sum == actual.sum, "Invalid sum");

        // Determine if this index is a leaf node of the primary tree or sub tree
        {
            uint256 treeDepth = Math.log2(nodeCount, Math.Rounding.Up);

            // Verify sub-tree leaves with known values
            if (indexDepth + depthPerRound >= treeDepth * 2) {
                // Calculate the offset into the leaf nodes in the final tree that match the supplied nodes
                uint256 offset = (_index * (2 ** (getNextDepth(_index, nodeCount) - indexDepth))) - (2 ** (treeDepth * 2));
                // Verify the leaves match the values we know on chain
                require(verifyLeaves(getUint(bytes32(proposalKey + blockNumberOffset)), nodeCount, offset, _nodes), "Invalid leaves");
            }

            if (indexDepth == treeDepth) {
                // The leaf node of the primary tree is just a hash of the sum
                bytes32 actualHash = keccak256(abi.encodePacked(actual.sum));
                require(expected.hash == actualHash, "Invalid hash");

                // Update the node to include the root hash of the sub tree
                setNode(_proposalID, _index, actual);
            } else {
                require(expected.hash == actual.hash, "Invalid hash");
            }
        }

        // Emit event
        emit RootSubmitted(_proposalID, getAddress(bytes32(proposalKey + proposerOffset)), uint32(getUint(bytes32(proposalKey + blockNumberOffset))), _index, actual, _nodes, block.timestamp);
    }

    /// @dev Checks a slice of the final nodes in a tree with the correct known on-chain values
    /// @param _blockNumber The block number used to generate the voting power tree
    /// @param _nodeCount The number of nodes that existed at the proposal block
    /// @param _offset The pollard's offset into the leaves
    /// @param _leaves The pollard's leaves
    /// @return True if the leaves match what is known on chain
    function verifyLeaves(uint256 _blockNumber, uint256 _nodeCount, uint256 _offset, Types.Node[] calldata _leaves) internal view returns (bool) {
        // Get contracts
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        // Calculate the closest power of 2 of the node count
        uint256 nodeCount = 2 ** Math.log2(_nodeCount, Math.Rounding.Up);
        uint32 blockNumber32 = uint32(_blockNumber);
        // Iterate over the leaves
        for (uint256 i = 0; i < _leaves.length; ++i) {
            // The leaf nodes are a 2d array of voting power in the form of [delegateIndex][nodeIndex] where both
            // arrays are padded out to the closest power of 2 with zeros
            uint256 nodeIndex = (_offset + i) % nodeCount;
            uint256 delegateIndex = (_offset + i) / nodeCount;
            // Determine the correct voting power for this leaf (fill with zero if > node count)
            uint256 actual = 0;
            if (nodeIndex < _nodeCount && delegateIndex < _nodeCount) {
                // Calculate the node and the delegate referred to by this leaf node
                address nodeAddress = rocketNodeManager.getNodeAt(nodeIndex);
                address actualDelegate = rocketNetworkVoting.getDelegate(nodeAddress, blockNumber32);
                // If a delegation exists, retrieve the node's voting power
                if (actualDelegate == rocketNodeManager.getNodeAt(delegateIndex)) {
                    actual = rocketNetworkVoting.getVotingPower(nodeAddress, blockNumber32);
                }
            }
            // Check provided leaves against actual sum
            if (_leaves[i].sum != actual) {
                return false;
            }
            // Check provided leaves against hash
            if (_leaves[i].hash != keccak256(abi.encodePacked(actual))) {
                return false;
            }
        }
        return true;
    }

    /// @notice Check if a vote is valid using a provided proof
    /// @param _voter address of the node operator casting the vote
    /// @param _nodeIndex index of the voting node
    /// @param _proposalID ID of the proposal being voted
    /// @param _votingPower VP being used with this vote
    /// @param _witness A merkle proof that will be verified
    function verifyVote(address _voter, uint256 _nodeIndex, uint256 _proposalID, uint256 _votingPower, Types.Node[] calldata _witness) external view returns (bool) {
        // Get contracts
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        // Verify voter
        if(rocketNodeManager.getNodeAt(_nodeIndex) != _voter) {
            return false;
        }
        // Load the proposal
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        // Calculate the network tree index for this voter
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
        uint256 depth = getMaxDepth(nodeCount);
        uint256 treeIndex = (2 ** depth) + _nodeIndex;
        // Reconstruct leaf node
        Types.Node memory leaf;
        leaf.sum = _votingPower;
        leaf.hash = keccak256(abi.encodePacked(_votingPower));
        // Retrieve the expected root node
        Types.Node memory expected = getNode(_proposalID, 1);
        // Compute a root from the supplied proof
        Types.Node memory actual = computeRootFromWitness(treeIndex, leaf, _witness);
        // Equality check
        return (actual.sum == expected.sum && actual.hash == expected.hash);
    }

    /// @dev Computes the root node given a witness
    /// @param _index The global index the proof is for
    /// @param _leaf The node at the global index `_index`
    /// @param _witness A merkle proof starting at the global index `_index`
    /// @return The computed root node for the given witness
    function computeRootFromWitness(uint256 _index, Types.Node memory _leaf, Types.Node[] calldata _witness) internal pure returns (Types.Node memory) {
        Types.Node memory root = _leaf;
        for (uint256 i = 0; i < _witness.length; ++i) {
            if (_index % 2 == 1) {
                root.hash = keccak256(abi.encodePacked(
                        _witness[i].hash, _witness[i].sum,
                        root.hash, root.sum
                    ));
            } else {
                root.hash = keccak256(abi.encodePacked(
                        root.hash, root.sum,
                        _witness[i].hash, _witness[i].sum
                    ));
            }

            root.sum += _witness[i].sum;
            _index = _index / 2;
        }
        return root;
    }

    /// @dev Computes the root node given a pollard
    /// @param _nodes An array of nodes to compute a root node for
    /// @return The computed root node
    function computeRootFromNodes(Types.Node[] calldata _nodes) internal pure returns (Types.Node memory) {
        uint256 len = _nodes.length / 2;
        // Perform first step into a new temporary memory buffer to leave original intact
        Types.Node[] memory temp = new Types.Node[](len);
        for (uint256 i = 0; i < len; ++i) {
            temp[i].hash = keccak256(abi.encodePacked(
                    _nodes[i * 2].hash, _nodes[i * 2].sum,
                    _nodes[i * 2 + 1].hash, _nodes[i * 2 + 1].sum
                ));
            temp[i].sum = _nodes[i * 2].sum + _nodes[i * 2 + 1].sum;
        }
        // Compute the remainder within the temporary buffer
        while (len > 1) {
            len /= 2;
            for (uint256 i = 0; i < len; ++i) {
                temp[i].hash = keccak256(abi.encodePacked(
                        temp[i * 2].hash, temp[i * 2].sum,
                        temp[i * 2 + 1].hash, temp[i * 2 + 1].sum
                    ));
                temp[i].sum = temp[i * 2].sum + temp[i * 2 + 1].sum;
            }
        }
        return temp[0];
    }

    /// @dev Calculates the depth of a given index
    /// @param _index The global index to calculate a depth for
    /// @return The depth of the global index `_index`
    function getDepthFromIndex(uint256 _index) internal pure returns (uint256) {
        return Math.log2(_index, Math.Rounding.Down);
    }

    /// @dev Calculates the number of rounds required to get to given index
    /// @param _index The global index to calculate number of rounds for
    /// @return The number of rounds it takes to get to the global index `_index`
    function getRoundsFromIndex(uint256 _index, uint256 _nodeCount) internal pure returns (uint256) {
        uint256 subTreeDepth = Math.log2(_nodeCount, Math.Rounding.Up);
        uint256 indexDepth = Math.log2(_index, Math.Rounding.Down);

        if (indexDepth <= subTreeDepth) {
            return (indexDepth - 1) / depthPerRound + 1;
        } else {
            uint256 phase2Depth = indexDepth - subTreeDepth;
            uint256 phase1Rounds = (subTreeDepth - 1) / depthPerRound + 1;
            uint256 phase2Rounds = (phase2Depth - 1) / depthPerRound + 1;
            return phase1Rounds + phase2Rounds;
        }
    }

    /// @dev Calculates the max depth of a tree containing specified number of nodes
    /// @param _nodeCount The number of nodes
    /// @return The max depth of a tree with `_nodeCount` many nodes
    function getMaxDepth(uint256 _nodeCount) internal pure returns (uint256) {
        return Math.log2(_nodeCount, Math.Rounding.Up);
    }

    /// @dev Calculates the depth of the next round taking into account the max depth
    /// @param _currentIndex The index to calculate the next depth for
    /// @param _nodeCount The number of nodes
    /// @return The next depth for a challenge
    function getNextDepth(uint256 _currentIndex, uint256 _nodeCount) internal pure returns (uint256) {
        uint256 currentDepth = getDepthFromIndex(_currentIndex);
        uint256 maxDepth = getMaxDepth(_nodeCount);
        uint256 nextDepth = currentDepth + depthPerRound;
        if (nextDepth > maxDepth * 2) {
            return maxDepth * 2;
        } else if (nextDepth > maxDepth) {
            if (currentDepth < maxDepth) {
                return maxDepth;
            }
        }
        return nextDepth;
    }

    /// @dev Calculates the root index of a pollard given the index of of one of its nodes
    /// @param _index The index to calculate a pollard root index from
    /// @return The pollard root index for node with global index of `_index`
    function getPollardRootIndex(uint256 _index, uint256 _nodeCount) internal pure returns (uint256) {
        require(_index > 1, "Invalid index");

        uint256 indexDepth = Math.log2(_index, Math.Rounding.Down);
        uint256 maxDepth = Math.log2(_nodeCount, Math.Rounding.Up);

        if (indexDepth < maxDepth) {
            // Index is leaf of phase 1 tree
            uint256 remainder = indexDepth % depthPerRound;
            require(remainder == 0, "Invalid index");
            return _index / (2 ** depthPerRound);
        } else if (indexDepth == maxDepth) {
            // Index is a network tree leaf
            uint256 remainder = indexDepth % depthPerRound;
            return _index / (2 ** (remainder == 0 ? depthPerRound : remainder));
        } else if (indexDepth < maxDepth * 2) {
            // Index is phase 2 pollard
            uint256 subIndexDepth = indexDepth - maxDepth;
            uint256 remainder = subIndexDepth % depthPerRound;
            require(remainder == 0, "Invalid index");
            return _index / (2 ** depthPerRound);
        }
        revert("Invalid index");
    }

    /// @dev Returns true if the given `_index` is in the path from the proposal root down to `_defeatIndex`
    /// @param _defeatIndex The index which resulted in the defeat of the proposal
    /// @param _index The index to check if it's within the defeat path
    /// @return True if `_index` was part of the path which defeated the proposal
    function isRewardedIndex(uint256 _defeatIndex, uint256 _index) internal pure returns (bool) {
        for (uint256 i = _defeatIndex; i > 1; i /= 2) {
            if (_index == i) {
                return true;
            }
        }
        return false;
    }

    /// @notice Returns the state of the given challenge
    /// @param _proposalID The ID of the proposal the challenge is for
    /// @param _index The global index of the node that is challenged
    /// @return The state of the challenge for the given proposal and node
    function getChallengeState(uint256 _proposalID, uint256 _index) override external view returns (Types.ChallengeState) {
        bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
        uint256 data = getUint(challengeKey);
        return _getChallengeState(data);
    }

    /// @dev Extracts the packed challenge state from the given uint256
    function _getChallengeState(uint256 _data) internal pure returns (Types.ChallengeState) {
        return Types.ChallengeState(uint8(_data >> stateOffset));
    }

    /// @dev Extracts the packed timestamp from the given uint256
    function getChallengeTimestamp(uint256 _data) internal pure returns (uint64) {
        return uint64(_data >> timestampOffset);
    }

    /// @dev Extracts the packed address of the challenger from the given uint256
    function getChallengeAddress(uint256 _data) internal pure returns (address) {
        return address(uint160(_data >> addressOffset));
    }

    /// @dev Modifies the packed challenge state of a given uint256
    function setChallengeState(uint256 _data, Types.ChallengeState _newState) internal pure returns (uint256) {
        _data &= ~(uint256(~uint8(0)) << stateOffset);
        _data |= uint256(_newState) << stateOffset;
        return _data;
    }

    /// @notice Retrieves the sum and hash of the node at the given global index
    function getNode(uint256 _proposalID, uint256 _index) public view returns (Types.Node memory) {
        uint256 challengeKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index)));
        Types.Node memory node;
        node.sum = getUint(bytes32(challengeKey + sumOffset));
        node.hash = getBytes32(bytes32(challengeKey + hashOffset));
        return node;
    }

    /// @dev Sets the sum and hash of the node at the given global index
    function setNode(uint256 _proposalID, uint256 _index, Types.Node memory _node) internal {
        uint256 challengeKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index)));
        setUint(bytes32(challengeKey + sumOffset), _node.sum);
        setBytes32(bytes32(challengeKey + hashOffset), _node.hash);
    }
}
