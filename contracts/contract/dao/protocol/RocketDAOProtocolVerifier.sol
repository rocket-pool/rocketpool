// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;
pragma abicoder v2;

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol";
import "../../../interface/network/RocketNetworkVotingInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";

import "hardhat/console.sol";

import "@openzeppelin4/contracts/utils/math/Math.sol";
import "../../../interface/token/RocketTokenRPLInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";

contract RocketDAOProtocolVerifier is RocketBase, RocketDAOProtocolVerifierInterface {

    // TODO: Should this be a configurable parameter or hardcoded?
    uint64 constant depthPerRound = 1;

    // TODO: Move these to parameters
    uint256 constant challengeBond = 10 ether;
    uint256 constant proposalBond = 100 ether;
    uint256 constant challengePeriod = 30 minutes;

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

    // TODO: Move to RocketStorage
    mapping(uint256 => mapping(uint256 => uint256)) challengeData;
    mapping(uint256 => uint256[]) challengeIndices;

    // Events
    event RootSubmitted(uint256 indexed proposalId, address indexed challenger, uint256 blockNumber, uint256 index, bytes32 rootHash, uint256 sum, Types.Node[] treeNodes);
    event ChallengeSubmitted(uint256 indexed proposalID, address indexed proposer, uint256 timestamp, uint256 index);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    /// @notice Returns the depth per round
    function getDepthPerRound() external view returns (uint64) {
        return depthPerRound;
    }

    /// @notice Returns an array of indices which have been challenged for a given proposal
    function getChallengeIndices(uint256 _proposalID) external view returns (uint256[] memory) {
        return challengeIndices[_proposalID];
    }

    /// @dev Called during a proposal submission to calculate and store the proposal root in the verifier
    function submitProposalRoot(uint256 _proposalID, address _proposer, uint32 _blockNumber, Types.Node[] memory _treeNodes) external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        // Get contracts
        RocketNetworkVotingInterface rocketNetworkVoting = RocketNetworkVotingInterface(getContractAddress("rocketNetworkVoting"));

        // Verify proposer supplied correct number of nodes
        uint64 nodeCount = uint64(rocketNetworkVoting.getNodeCount(_blockNumber));
        uint256 maxDepth = getMaxDepth(nodeCount);
        if (maxDepth < depthPerRound) {
            uint256 leafCount = 2 ** maxDepth;
            require(_treeNodes.length == leafCount, "Invalid node count");
        } else {
            require(_treeNodes.length == 2 ** depthPerRound, "Invalid node count");
        }

        // Compute the proposal root from the supplied nodes
        Types.Node memory root = computeRootFromNodes(_treeNodes);

        // Store proposal root details
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        setAddress(bytes32(proposalKey + proposerOffset), _proposer);
        setUint(bytes32(proposalKey + blockNumberOffset), _blockNumber);
        setUint(bytes32(proposalKey + nodeCountOffset), nodeCount);
        setBytes32(bytes32(proposalKey + rootHashOffset), root.hash);
        setUint(bytes32(proposalKey + rootSumOffset), root.sum);

        // Mark the root as having been responded to
        uint256 state = uint256(Types.ChallengeState.Responded) << stateOffset;
        state |= block.timestamp << timestampOffset;
        challengeData[_proposalID][1] = state;

        // Emit event
        emit RootSubmitted(_proposalID, _proposer, _blockNumber, 1, root.hash, root.sum, _treeNodes);
    }

    /// @notice Used by a verify to challenge a specific index of the proposal
    /// @param _proposalID The ID of the proposal being challenged
    /// @param _index The global index of the node being challenged
    function createChallenge(uint256 _proposalID, uint64 _index) external {
        // Check for existing challenge against this index
        uint256 state = challengeData[_proposalID][_index];
        require(state == 0, "Index already challenged");

        // Check depth is exactly one round deeper than a previous challenge (or the proposal root)
        uint256 previousIndex = getPollardRootIndex(_index);
        require(previousIndex == 1 || challengeData[_proposalID][previousIndex] != 0, "Invalid challenge depth");

        // Precompute the proposal key
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));

        // Retrieve the node count of this proposal
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));

        // Check challenge index doesn't equal or exceed max depth
        uint256 maxDepth = getMaxDepth(nodeCount);
        uint256 depth = getDepthFromIndex(_index);
        require(depth < maxDepth, "Invalid index depth");

        // Write challenge state and add to set
        state = uint256(Types.ChallengeState.Challenged) << stateOffset;
        state |= block.timestamp << timestampOffset;
        state |= uint256(uint160(msg.sender)) << addressOffset;
        challengeData[_proposalID][_index] = state;
        challengeIndices[_proposalID].push(_index);

        // Emit event
        emit ChallengeSubmitted(_proposalID, msg.sender, block.timestamp, _index);
    }

    /// @notice Can be called if proposer fails to respond to a challenge within the required time limit. Destroys the proposal if successful
    /// @param _proposalID The ID of the challenged proposal
    /// @param _index The index which was failed to respond to
    function defeatProposal(uint256 _proposalID, uint256 _index) external {
        // Check the challenge at the given index has not been responded to
        uint256 data = challengeData[_proposalID][_index];
        Types.ChallengeState state = getChallengeState(data);
        require(state == Types.ChallengeState.Challenged, "Invalid challenge state");

        // Precompute defeat index key
        bytes32 defeatIndexKey = bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset);

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

    function claimBondChallenger(uint256 _proposalID, uint256[] calldata _indices) external {
        // Check that the proposal was defeated
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));
        bool defeated = defeatIndex != 0;

        // Calculate the number of challenges involved in defeating the proposal
        uint256 totalDefeatingIndices = getDepthFromIndex(defeatIndex) / depthPerRound;

        // Keep track of the number of indices the claimer had which were involved in defeating the proposal
        uint256 rewardedIndices = 0;

        for (uint256 i = 0; i < _indices.length; i++) {
            uint256 data = challengeData[_proposalID][_indices[i]];
            Types.ChallengeState challengeState = getChallengeState(data);

            if (defeated) {
                // Refund all challenges if the proposal was defeated
                require(challengeState == Types.ChallengeState.Responded || challengeState == Types.ChallengeState.Challenged, "Invalid challenge state");
            } else {
                // Only refund non-responded challenges if the proposal wasn't defeated
                require(challengeState == Types.ChallengeState.Challenged, "Invalid challenge state");
            }

            // Check the challenger is the caller
            address challenger = address(uint160(data >> addressOffset));
            require(msg.sender == challenger, "Invalid challenger");

            // Increment reward indices if required
            if (isRewardedIndex(defeatIndex, _indices[i])) {
                console.log("Index %s defeated proposal, paying reward", _indices[i]);
                rewardedIndices++;
            } else {
                console.log("Index %s was not used, returning bond", _indices[i]);
            }

            // Mark index as paid
            data = setChallengeState(data, Types.ChallengeState.Paid);
            challengeData[_proposalID][_indices[i]] = data;
        }

        // Return challenger bond
        uint256 totalBond = _indices.length * challengeBond;
        console.log("Return challenger %s RPL bond", totalBond);

        // Pay challenger their reward
        if (rewardedIndices > 0) {
            uint256 totalReward = proposalBond * rewardedIndices / totalDefeatingIndices;
            console.log("Paying challenger %s RPL reward", totalReward);
        }
    }

    function claimBondProposer(uint256 _proposalID, uint256[] calldata _indices) external {
        // Check that the proposal hasn't been defeated
        uint256 defeatIndex = getUint(bytes32(uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)))+defeatIndexOffset));
        require(defeatIndex == 0, "Proposal defeated");

        // Check the proposal has passed the waiting period
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOProposalInterface.ProposalState proposalState = daoProposal.getState(_proposalID);
        require(proposalState >= RocketDAOProposalInterface.ProposalState.Succeeded, "Invalid proposal state");

        // Keep track of if this claim includes the proposal root
        bool containsProposalRoot = false;

        // Verify indices
        for (uint256 i = 0; i < _indices.length; i++) {
            // Check the challenge of the given index was responded to
            uint256 state = challengeData[_proposalID][_indices[i]];
            Types.ChallengeState challengeState = getChallengeState(state);
            require(challengeState == Types.ChallengeState.Responded, "Invalid challenge state");

            // Mark index as paid
            state = setChallengeState(state, Types.ChallengeState.Paid);
            challengeData[_proposalID][_indices[i]] = state;

            // If claiming the root, then we return the proposal bond
            if (_indices[i] == 1) {
                containsProposalRoot = true;
            }
        }

        // Pay proposer the bonds
        uint256 totalBond = _indices.length * challengeBond;
        console.log("Paying proposer %s RPL", totalBond);

        if (containsProposalRoot) {
            console.log("Refunding proposer %s RPL", proposalBond);
        }
    }

    /// @notice Used by a proposer to defend a challenged index
    function submitRoot(uint256 _proposalID, uint256 _index, Types.Node[] calldata _witness, Types.Node[] memory _nodes) external {
        // Get challenge state
        uint256 state = challengeData[_proposalID][_index];
        require(state != 0, "Challenge does not exist");

        // Verify witness length
        uint256 depth = getDepthFromIndex(_index);
        require(_witness.length == depth, "Invalid witness length");

        // Load the proposal
        uint256 proposalKey = uint256(keccak256(abi.encodePacked("dao.protocol.proposal", _proposalID)));
        uint256 nodeCount = getUint(bytes32(proposalKey + nodeCountOffset));
        uint256 blockNumber = getUint(bytes32(proposalKey + blockNumberOffset));
        address proposer = getAddress(bytes32(proposalKey + proposerOffset));

        // Check the proposal hasn't already been defeated
        require(getUint(bytes32(proposalKey + defeatIndexOffset)) == 0, "Proposal already defeated");

        // Check if this is the final round
        {
            uint256 maxDepth = getMaxDepth(nodeCount);
            uint256 nextDepth = getNextDepth(_index, nodeCount);
            if (nextDepth == maxDepth) {
                // Calculate the offset into the leaf nodes in the final tree that match the supplied nodes
                uint256 n = nextDepth - depth;
                uint256 offset = (_index * (2 ** n)) - (2 ** maxDepth);
                // Verify the leaves
                require(verifyLeaves(blockNumber, nodeCount, offset, _nodes), "Invalid leaves");
            }
        }

        // Verify correct number of nodes
        require(_nodes.length == 2 ** (getNextDepth(_index, nodeCount) - depth), "Invalid node count");

        // Compute the parent node of the challenge
        Types.Node memory root = computeRootFromNodes(_nodes);

        {
            // Verify the proof to the proposal root
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

        // Update state
        state = setChallengeState(state, Types.ChallengeState.Responded);
        challengeData[_proposalID][_index] = state;

        // Emit event
        emit RootSubmitted(_proposalID, proposer, block.number, _index, root.hash, root.sum, _nodes);
    }

    /// @dev Checks a slice of the final nodes in a tree with the correct known on-chain values
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
            if (_leaves[i].sum != actual) {
                return false;
            }
            if (_leaves[i].hash != keccak256(abi.encodePacked(actual))) {
                return false;
            }
        }
        return true;
    }

    /// @dev Computes the root node given a witness
    function computeRootFromWitness(uint256 _index, Types.Node memory _leaf, Types.Node[] calldata _witness) internal returns (Types.Node memory root) {
        root = _leaf;
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
    }

    /// @dev Computes the root node given a pollard
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
    function getDepthFromIndex(uint256 _index) internal pure returns (uint256) {
        return Math.log2(_index, Math.Rounding.Down);
    }

    /// @dev Calculates the max depth of a tree containing specified number of nodes
    function getMaxDepth(uint256 _nodeCount) internal pure returns (uint256) {
        return 2 * Math.log2(_nodeCount, Math.Rounding.Up);
    }

    /// @dev Calculates the depth of the next round taking into account the max depth
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
    function getPollardRootIndex(uint256 _index) internal pure returns (uint256) {
        // Index is within the first pollard depth
        if (_index < 2 ** depthPerRound) {
            return 1;
        }
        return _index / (2 ** depthPerRound);
    }


    /// @dev Returns true if the given `_index` is in the path from the proposal root down to `_defeatIndex`
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

    /// @dev Modifies the packed challenge state of a given uint256
    function setChallengeState(uint256 _data, Types.ChallengeState _newState) internal pure returns (uint256) {
        _data &= ~(uint256(~uint8(0)) << stateOffset);
        _data |= uint256(_newState) << stateOffset;
        return _data;
    }
}
