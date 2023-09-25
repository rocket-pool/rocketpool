// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

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

contract RocketDAOProtocolVerifier is RocketBase, RocketDAOProtocolVerifierInterface {

    uint256 constant depthPerRound = 1;

    // Packing constants for packing challenge into a single uint256
    uint256 constant stateOffset = (256 - 8);
    uint256 constant timestampOffset = (256 - 8 - 64);
    uint256 constant addressOffset = (256 - 8 - 64 - 160);

    // Offsets into storage for proposal details
    uint256 constant proposerOffset = 0;
    uint256 constant blockNumberOffset = 1;
    uint256 constant nodeCountOffset = 2;
    uint256 constant rootHashOffset = 3;
    uint256 constant rootSumOffset = 4;
    uint256 constant defeatIndexOffset = 5;
    uint256 constant proposalBondOffset = 6;
    uint256 constant challengeBondOffset = 7;
    uint256 constant challengePeriodOffset = 8;

    // Events
    event RootSubmitted(uint256 indexed proposalId, address indexed proposer, uint32 blockNumber, uint256 index, bytes32 rootHash, uint256 sum, Types.Node[] treeNodes, uint256 timestamp);
    event ChallengeSubmitted(uint256 indexed proposalID, address indexed challenger, uint256 index, uint256 timestamp);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    /// @notice Returns the depth per round
    function getDepthPerRound() external view returns (uint256) {
        return depthPerRound;
    }

    /// @dev Called during a proposal submission to calculate and store the proposal root so it is available for challenging
    /// @param _proposalID The ID of the proposal
    /// @param _proposer The node raising the proposal
    /// @param _blockNumber The block number used to generate the voting power tree
    /// @param _treeNodes A pollard of the voting power tree
    function submitProposalRoot(uint256 _proposalID, address _proposer, uint32 _blockNumber, Types.Node[] memory _treeNodes) external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
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
            setBytes32(bytes32(proposalKey + rootHashOffset), root.hash);
            setUint(bytes32(proposalKey + rootSumOffset), root.sum);
            setUint(bytes32(proposalKey + proposalBondOffset), proposalBond);
            setUint(bytes32(proposalKey + challengeBondOffset), rocketDAOProtocolSettingsProposals.getChallengeBond());
            setUint(bytes32(proposalKey + challengePeriodOffset), rocketDAOProtocolSettingsProposals.getChallengePeriod());
        }

        // The root was supplied so mark that index (1) as responded
        uint256 state = uint256(Types.ChallengeState.Responded) << stateOffset;
        state |= block.timestamp << timestampOffset;
        setUint(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, uint256(1))), state);

        // Emit event
        emit RootSubmitted(_proposalID, _proposer, _blockNumber, 1, root.hash, root.sum, _treeNodes, block.timestamp);
    }

    /// @notice Used by a verifier to challenge a specific index of a proposal's voting power tree
    /// @param _proposalID The ID of the proposal being challenged
    /// @param _index The global index of the node being challenged
    function createChallenge(uint256 _proposalID, uint256 _index) external {
        // Check for existing challenge against this index
        bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
        uint256 challengeData = getUint(challengeKey);
        require(challengeData == 0, "Index already challenged");

        // Check depth is exactly one round deeper than a previous challenge (or the proposal root)
        uint256 previousIndex = getPollardRootIndex(_index);
        require(getChallengeState(getUint(keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, previousIndex)))) == Types.ChallengeState.Responded, "Invalid challenge depth");

        // Precompute the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));

        // Retrieve the node count of this proposal
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));

        // Check challenge index doesn't equal or exceed max depth
        uint256 maxDepth = getMaxDepth(nodeCount);
        uint256 depth = getDepthFromIndex(_index);
        require(depth < maxDepth, "Invalid index depth");

        // Write challenge
        challengeData = uint256(Types.ChallengeState.Challenged) << stateOffset;
        challengeData |= block.timestamp << timestampOffset;
        challengeData |= uint256(uint160(msg.sender)) << addressOffset;
        setUint(challengeKey, challengeData);

        // Lock the challenger's bond (reverts if not enough effective RPL)
        uint256 challengeBond = getUint(bytes32(proposalKey + challengeBondOffset));
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStaking.lockRPL(msg.sender, challengeBond);

        // Emit event
        emit ChallengeSubmitted(_proposalID, msg.sender, _index, block.timestamp);
    }

    /// @notice Can be called if proposer fails to respond to a challenge within the required time limit. Destroys the proposal if successful
    /// @param _proposalID The ID of the challenged proposal
    /// @param _index The index which was failed to respond to
    function defeatProposal(uint256 _proposalID, uint256 _index) external {
        // Check the challenge at the given index has not been responded to
        bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
        uint256 data = getUint(challengeKey);
        Types.ChallengeState state = getChallengeState(data);
        require(state == Types.ChallengeState.Challenged, "Invalid challenge state");

        // Precompute defeat index key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        bytes32 defeatIndexKey = bytes32(proposalKey+defeatIndexOffset);
        uint256 challengePeriod = getUint(bytes32(proposalKey + challengePeriodOffset));

        // Check the proposal hasn't already been defeated
        uint256 defeatIndex = getUint(defeatIndexKey);
        require(defeatIndex == 0, "Proposal already defeated");

        // Check enough time has passed
        uint256 timestamp = getChallengeTimestamp(data);
        require(block.timestamp > timestamp + challengePeriod, "Not enough time has passed");

        // Destroy the proposal
        RocketDAOProtocolProposalsInterface rocketDAOProtocolProposals = RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals"));
        rocketDAOProtocolProposals.destroy(_proposalID);

        // Record the winning index for reward payments
        setUint(defeatIndexKey, _index);
    }

    /// @notice Called by a challenger to claim bonds (both refunded bonds and any rewards paid)
    /// @param _proposalID The ID of the proposal
    /// @param _indices An array of indices which the challenger has a claim against
    function claimBondChallenger(uint256 _proposalID, uint256[] calldata _indices) external {
        // Check whether the proposal was defeated
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));
        bool defeated = defeatIndex != 0;

        // Keep track of the number of indices the claimer had which were involved in defeating the proposal
        uint256 rewardedIndices = 0;

        for (uint256 i = 0; i < _indices.length; i++) {
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _indices[i]));
            uint256 challengeData = getUint(challengeKey);
            Types.ChallengeState challengeState = getChallengeState(challengeData);

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
            uint256 totalDefeatingIndices = getDepthFromIndex(defeatIndex) / depthPerRound;
            uint256 totalReward = proposalBond * rewardedIndices / totalDefeatingIndices;
            // Unlock the reward amount from the proposer and transfer it to the challenger
            uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
            address proposer = getAddress(bytes32(proposalKey + proposerOffset));
            rocketNodeStaking.unlockRPL(proposer, totalReward);
            rocketNodeStaking.transferRPL(proposer, msg.sender, totalReward);
        }
    }

    /// @notice Called by a proposer to claim bonds (both refunded bond and any rewards paid)
    /// @param _proposalID The ID of the proposal
    /// @param _indices An array of indices which the challenger has a claim against
    function claimBondProposer(uint256 _proposalID, uint256[] calldata _indices) external {
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));

        // Proposer has nothing to claim if their proposal was defeated
        require(defeatIndex == 0, "Proposal defeated");

        // Check the proposal has passed the waiting period
        {
            RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
            RocketDAOProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
            require(proposalState >= RocketDAOProposalInterface.ProposalState.Active, "Invalid proposal state");
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

        for (uint256 i = 0; i < _indices.length; i++) {
            // Check the challenge of the given index was responded to
            bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _indices[i]));
            uint256 state = getUint(challengeKey);

            // Proposer can only claim the reward on indices they responded to
            require(getChallengeState(state) == Types.ChallengeState.Responded, "Invalid challenge state");

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
                rocketNodeStaking.transferRPL(challenger, proposer, challengeBond);
            }
        }
    }

    /// @notice Used by a proposer to defend a challenged index
    /// @param _proposalID The ID of the proposal
    /// @param _index The global index of the node for which the proposer is submitting a new pollard
    /// @param _witness A merkle proof from `_index` to the stored root
    /// @param _nodes A list of nodes making up the new pollard
    function submitRoot(uint256 _proposalID, uint256 _index, Types.Node[] calldata _witness, Types.Node[] memory _nodes) external {
        // Get challenge state
        bytes32 challengeKey = keccak256(abi.encodePacked("dao.protocol.proposal.challenge", _proposalID, _index));
        uint256 state = getUint(challengeKey);

        // Make sure this index was actually challenged
        require(state != 0, "Challenge does not exist");

        // Verify witness length
        uint256 depth = getDepthFromIndex(_index);
        require(_witness.length == depth, "Invalid witness length");

        // Load the proposal
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
        uint256 blockNumber = getUint(bytes32(proposalKey + blockNumberOffset));

        // Check the proposal hasn't already been defeated
        require(getUint(bytes32(proposalKey + defeatIndexOffset)) == 0, "Proposal already defeated");

        {
            uint256 maxDepth = getMaxDepth(nodeCount);
            uint256 nextDepth = getNextDepth(_index, nodeCount);

            // Check if this is the final round
            if (nextDepth == maxDepth) {
                // Calculate the offset into the leaf nodes in the final tree that match the supplied nodes
                uint256 n = nextDepth - depth;
                uint256 offset = (_index * (2 ** n)) - (2 ** maxDepth);
                // Verify the leaves match the values we know on chain
                require(verifyLeaves(blockNumber, nodeCount, offset, _nodes), "Invalid leaves");
            }
        }

        // Verify correct number of nodes in the pollard
        require(_nodes.length == 2 ** (getNextDepth(_index, nodeCount) - depth), "Invalid node count");

        // Compute the parent node of the challenge
        Types.Node memory root = computeRootFromNodes(_nodes);

        {
            // Verify the supplied witness (proves the supplied data actually matches the original tree)
            bytes32 hash = getBytes32(bytes32(proposalKey + rootHashOffset));
            uint256 sum = getUint(bytes32(proposalKey + rootSumOffset));
            if (depth > 0) {
                Types.Node memory rootFromWitness = computeRootFromWitness(_index, root, _witness);
                require(rootFromWitness.hash == hash && rootFromWitness.sum == sum, "Invalid proof");
            } else {
                require(root.hash == hash, "Invalid root hash");
                require(root.sum == sum, "Invalid root sum");
            }
        }

        // Mark the index as responded
        state = setChallengeState(state, Types.ChallengeState.Responded);
        setUint(challengeKey, state);

        // Emit event
        {
            address proposer = getAddress(bytes32(proposalKey + proposerOffset));
            emit RootSubmitted(_proposalID, proposer, uint32(block.number), _index, root.hash, root.sum, _nodes, block.timestamp);
        }
    }

    /// @dev Checks a slice of the final nodes in a tree with the correct known on-chain values
    /// @param _blockNumber The block number used to generate the voting power tree
    /// @param _nodeCount The number of nodes that existed at the proposal block
    /// @param _offset The pollard's offset into the leaves
    /// @param _leaves The pollard's leaves
    /// @return True if the leaves match what is known on chain
    function verifyLeaves(uint256 _blockNumber, uint256 _nodeCount, uint256 _offset, Types.Node[] memory _leaves) internal view returns (bool) {
        // Get contracts
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        // Calculate the closest power of 2 of the node count
        uint256 nodeCount = 2 ** Math.log2(_nodeCount, Math.Rounding.Up);
        // Iterate over the leaves
        for (uint256 i = 0; i < _leaves.length; i++) {
            // The leaf nodes are a 2d array of voting power in the form of [delegateIndex][nodeIndex] where both
            // arrays are padded out to the closest power of 2 with zeros
            uint256 nodeIndex = (_offset + i) % nodeCount;
            uint256 delegateIndex = (_offset + i) / nodeCount;
            // Determine the correct voting power for this leaf (fill with zero if > node count)
            uint256 actual = 0;
            if (nodeIndex < _nodeCount && delegateIndex < _nodeCount) {
                // Calculate the node and the delegate referred to by this leaf node
                address actualDelegate = rocketNetworkVoting.getDelegate(rocketNodeManager.getNodeAt(nodeIndex), uint32(_blockNumber));
                // If a delegation exists, retrieve the node's voting power
                if (actualDelegate == rocketNodeManager.getNodeAt(delegateIndex)) {
                    actual = rocketNetworkVoting.getVotingPower(rocketNodeManager.getNodeAt(nodeIndex), uint32(_blockNumber));
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

    /// @dev Computes the root node given a witness
    /// @param _index The global index the proof is for
    /// @param _leaf The node at the global index `_index`
    /// @param _witness A merkle proof starting at the global index `_index`
    /// @return The computed root node for the given witness
    function computeRootFromWitness(uint256 _index, Types.Node memory _leaf, Types.Node[] calldata _witness) internal returns (Types.Node memory) {
        Types.Node memory root = _leaf;
        for (uint256 i = 0; i < _witness.length; i++) {
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
    function computeRootFromNodes(Types.Node[] memory _nodes) internal view returns (Types.Node memory) {
        uint256 len = _nodes.length / 2;
        // Perform first step into a new temporary memory buffer to leave original intact
        Types.Node[] memory temp = new Types.Node[](len);
        for (uint256 i = 0; i < len; i++) {
            temp[i].hash = keccak256(abi.encodePacked(
                    _nodes[i * 2].hash, _nodes[i * 2].sum,
                    _nodes[i * 2 + 1].hash, _nodes[i * 2 + 1].sum
                ));
            temp[i].sum = _nodes[i * 2].sum + _nodes[i * 2 + 1].sum;
        }
        // Compute the remainder within the temporary buffer
        while (len > 1) {
            len /= 2;
            for (uint256 i = 0; i < len; i++) {
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

    /// @dev Calculates the max depth of a tree containing specified number of nodes
    /// @param _nodeCount The number of nodes
    /// @return The max depth of a tree with `_nodeCount` many nodes
    function getMaxDepth(uint256 _nodeCount) internal pure returns (uint256) {
        return 2 * Math.log2(_nodeCount, Math.Rounding.Up);
    }

    /// @dev Calculates the depth of the next round taking into account the max depth
    /// @param _currentIndex The index to calculate the next depth for
    /// @param _nodeCount The number of nodes
    /// @return The next depth for a challenge
    function getNextDepth(uint256 _currentIndex, uint256 _nodeCount) internal pure returns (uint256) {
        uint256 currentDepth = getDepthFromIndex(_currentIndex);
        uint256 maxDepth = getMaxDepth(_nodeCount);
        uint256 nextDepth = currentDepth + depthPerRound;
        if (nextDepth > maxDepth) {
            return maxDepth;
        }
        return nextDepth;
    }

    /// @dev Calculates the root index of a pollard given the index of of one of its nodes
    /// @param _index The index to calculate a pollard root index from
    /// @return The pollard root index for node with global index of `_index`
    function getPollardRootIndex(uint256 _index) internal pure returns (uint256) {
        // Index is within the first pollard depth
        if (_index < 2 ** depthPerRound) {
            return 1;
        }
        return _index / (2 ** depthPerRound);
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

    /// @dev Extracts the packed challenge state from the given uint256
    function getChallengeState(uint256 _data) internal pure returns (Types.ChallengeState) {
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
}
