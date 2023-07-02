// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface Types {
    enum ChallengeState {
        Unchallenged,
        Challenged,
        Responded,
        Paid
    }

    struct Proposal {
        address proposer;
        uint32 blockNumber;
        uint128 nodeCount;
        bytes32 hash;
        uint256 sum;
    }

    struct Node {
        bytes32 hash;
        uint256 sum;
    }

    struct Leaf {
        address nodeAddress;
        uint256 effectiveRpl;
    }
}

interface RocketDAOProtocolVerifierInterface {
    function submitProposalRoot(uint256 _proposalId, address _proposer, uint32 _blockNumber, Types.Node[] memory _treeNodes) external;
    function createChallenge(uint256 propId, uint64 index) external;
    function submitRoot(uint256 propId, uint256 index, Types.Node[] calldata witness, Types.Node[] memory nodes) external;
}
