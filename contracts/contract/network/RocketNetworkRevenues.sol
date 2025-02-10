// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";

/// @notice Handles the calculations of revenue splits for the protocol's Universal Adjustable Revenue Split
contract RocketNetworkRevenues is RocketBase, RocketNetworkRevenuesInterface {
    uint256 private constant shareMagnitude = 100_000;
    uint256 private constant shareScale = 1 ether / shareMagnitude;

    bytes32 private immutable nodeShareKey;
    bytes32 private immutable voterShareKey;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
        // Initialise immutables
        nodeShareKey = keccak256(abi.encodePacked("network.revenue.node.share"));
        voterShareKey = keccak256(abi.encodePacked("network.revenue.voter.share"));
    }

    /// @dev Only allows calls from the pDAO setting contract or the security DAO contract
    modifier onlyProtocolOrSecurityDAO() {
        if(msg.sender != getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsNetwork")))) {
            if(msg.sender != getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOSecurityProposals")))) {
                revert("Invalid or outdated network contract");
            }
        }
        _;
    }

    /// @notice Used following an upgrade or new deployment to initialise the revenue split system
    /// @param _initialNodeShare The initial value to for the node share
    /// @param _initialVoterShare The initial value to for the voter share
    function initialise(uint256 _initialNodeShare, uint256 _initialVoterShare) override public {
        // On new deploy, allow guardian to initialise, otherwise, only a network contract
        if (rocketStorage.getDeployedStatus()) {
            require(getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))), "Invalid or outdated network contract");
        } else {
            require(msg.sender == rocketStorage.getGuardian(), "Not guardian");
        }
        // Initialise the shares
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        (bool exists,,) = rocketNetworkSnapshots.latest(nodeShareKey);
        require(!exists, "Already initialised");
        // Initialise node share
        bytes32 valueKey = bytes32(uint256(nodeShareKey) + block.number);
        setUint(valueKey, _initialNodeShare / shareScale);
        rocketNetworkSnapshots.push(nodeShareKey, 0);
        // Initialise voter share
        valueKey = bytes32(uint256(voterShareKey) + block.number);
        setUint(valueKey, _initialVoterShare / shareScale);
        rocketNetworkSnapshots.push(voterShareKey, 0);
    }

    /// @notice Returns the current node share value
    function getCurrentNodeShare() external override view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        return _getCurrentShare(rocketNetworkSnapshots, nodeShareKey);
    }

    /// @notice Returns the current voter share value
    function getCurrentVoterShare() external override view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        return _getCurrentShare(rocketNetworkSnapshots, voterShareKey);
    }

    /// @notice Called by a pDAO governance contract or security council to update the `node_operator_commission_share` parameter
    /// @param _newShare The value to set `node_operator_commission_share` to
    function setNodeShare(uint256 _newShare) external override onlyProtocolOrSecurityDAO {
        _setShare(nodeShareKey, _newShare);
    }

    /// @notice Called by a pDAO governance contract or security council to update the `voter_share` parameter
    /// @param _newShare The value to set the `voter_share` to
    function setVoterShare(uint256 _newShare) external override onlyProtocolOrSecurityDAO {
        _setShare(voterShareKey, _newShare);
    }

    /// @notice Calculates the time-weighted average revenue split values between the supplied block number and now
    /// @param _sinceBlock The starting block number for the calculation
    function calculateSplit(uint256 _sinceBlock) external override view returns (uint256 nodeShare, uint256 voterShare, uint256 rethShare) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        if (_sinceBlock == block.number) {
            nodeShare = _getCurrentShare(rocketNetworkSnapshots, nodeShareKey);
            voterShare = _getCurrentShare(rocketNetworkSnapshots, voterShareKey);
        } else {
            require(_sinceBlock < block.number, "Block must be in the past");
            // Query accumulators
            uint256 nodeShareAccumLast = getAccumulatorAt(rocketNetworkSnapshots, nodeShareKey, _sinceBlock);
            uint256 voterShareAccumLast = getAccumulatorAt(rocketNetworkSnapshots, voterShareKey, _sinceBlock);
            uint256 nodeShareAccumCurr = getAccumulatorAt(rocketNetworkSnapshots, nodeShareKey, block.number);
            uint256 voterShareAccumCurr = getAccumulatorAt(rocketNetworkSnapshots, voterShareKey, block.number);
            // Calculate average fee between the blocks
            uint256 duration = (block.number - _sinceBlock);
            nodeShare = (nodeShareAccumCurr - nodeShareAccumLast) / duration;
            voterShare = (voterShareAccumCurr - voterShareAccumLast) / duration;
            // Scale values
            nodeShare *= shareScale;
            voterShare *= shareScale;
        }
        uint256 rethCommission = nodeShare + voterShare;
        rethShare = 1 ether - rethCommission;
        return (nodeShare, voterShare, rethShare);
    }

    /// @dev Calculates the cumulative value of the accumulator at a given block
    function getAccumulatorAt(RocketNetworkSnapshotsInterface _rocketNetworkSnapshots, bytes32 _key, uint256 _block) internal view returns (uint256) {
        (bool checkpointExists, uint32 checkpointBlock, uint224 checkpointValue) = _rocketNetworkSnapshots.lookupCheckpoint(_key, uint32(_block));
        require(checkpointExists, "RocketNetworkRevenues is not initialised");
        bytes32 valueKey = bytes32(uint256(_key) + checkpointBlock);
        uint256 valueAtBlock = getUint(valueKey);
        uint256 blockDuration = (_block - checkpointBlock);
        return uint256(checkpointValue) + (valueAtBlock * blockDuration);
    }

    /// @dev Convenience method to return the current value given a key
    function _getCurrentShare(RocketNetworkSnapshotsInterface _rocketNetworkSnapshots, bytes32 _key) internal view returns (uint256) {
        (bool exists, uint32 blockNumber, ) = _rocketNetworkSnapshots.latest(_key);
        require(exists, "RocketNetworkRevenues is not initialised");
        bytes32 valueKey = bytes32(uint256(_key) + blockNumber);
        return getUint(valueKey) * shareScale;
    }

    /// @dev Sets the share value of the given key
    /// @param _key Key of the share value to set
    /// @param _newShare Value to set it to
    function _setShare(bytes32 _key, uint256 _newShare) internal {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        uint256 currentAccum = getAccumulatorAt(rocketNetworkSnapshots, _key, block.number);
        rocketNetworkSnapshots.push(_key, uint224(currentAccum));
        uint256 newShareScaled = _newShare / shareScale;
        bytes32 valueKey = bytes32(uint256(_key) + block.number);
        setUint(valueKey, newShareScaled);
    }
}
