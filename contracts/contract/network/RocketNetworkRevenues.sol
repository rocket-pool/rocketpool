// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";

/// @notice Handles the calculations of revenue splits for the protocol's Universal Adjustable Revenue Split
contract RocketNetworkRevenues is RocketBase, RocketNetworkRevenuesInterface {
    // Constants
    uint256 private constant shareMagnitude = 100_000;
    uint256 private constant shareScale = 1 ether / shareMagnitude;
    bytes32 private constant nodeShareKey = keccak256(abi.encodePacked("network.revenue.node.share"));
    bytes32 private constant voterShareKey = keccak256(abi.encodePacked("network.revenue.voter.share"));
    bytes32 private constant protocolDAOShareKey = keccak256(abi.encodePacked("network.revenue.pdao.share"));

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
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
    /// @param _initialProtocolDAOShare The initial value to for the pdao share
    function initialise(uint256 _initialNodeShare, uint256 _initialVoterShare, uint256 _initialProtocolDAOShare) override public {
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
        // Initialise pdao share
        valueKey = bytes32(uint256(protocolDAOShareKey) + block.number);
        setUint(valueKey, _initialProtocolDAOShare / shareScale);
        rocketNetworkSnapshots.push(protocolDAOShareKey, 0);
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

    /// @notice Returns the current pDAO share value
    function getCurrentProtocolDAOShare() external override view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        return _getCurrentShare(rocketNetworkSnapshots, protocolDAOShareKey);
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

    /// @notice Called by a pDAO governance contract or security council to update the `pdao_share` parameter
    /// @param _newShare The value to set the `pdao_share` to
    function setProtocolDAOShare(uint256 _newShare) external override onlyProtocolOrSecurityDAO {
        _setShare(protocolDAOShareKey, _newShare);
    }

    /// @notice Calculates the time-weighted average revenue split values between the supplied block number and now
    /// @param _sinceBlock The starting block number for the calculation
    function calculateSplit(uint256 _sinceBlock) external override view returns (uint256 nodeShare, uint256 voterShare, uint256 protocolDAOShare, uint256 rethShare) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        if (_sinceBlock == block.number) {
            nodeShare = _getCurrentShare(rocketNetworkSnapshots, nodeShareKey);
            voterShare = _getCurrentShare(rocketNetworkSnapshots, voterShareKey);
            protocolDAOShare = _getCurrentShare(rocketNetworkSnapshots, protocolDAOShareKey);
        } else {
            require(_sinceBlock < block.number, "Block must be in the past");
            nodeShare = getAverageSince(rocketNetworkSnapshots, _sinceBlock, nodeShareKey);
            voterShare = getAverageSince(rocketNetworkSnapshots, _sinceBlock, voterShareKey);
            protocolDAOShare = getAverageSince(rocketNetworkSnapshots, _sinceBlock, protocolDAOShareKey);
        }
        uint256 rethCommission = nodeShare + voterShare + protocolDAOShare;
        rethShare = 1 ether - rethCommission;
        return (nodeShare, voterShare, protocolDAOShare, rethShare);
    }

    /// @notice Calculates the time-weighted average since a given block
    function getAverageSince(RocketNetworkSnapshotsInterface _rocketNetworkSnapshots, uint256 _sinceBlock, bytes32 _key) internal view returns (uint256) {
        (bool checkpointExists, uint32 checkpointBlock, uint224 checkpointValue) = _rocketNetworkSnapshots.latest(_key);
        require(checkpointExists, "RocketNetworkRevenues is not initialised");
        if (checkpointBlock <= _sinceBlock) {
            // Value hasn't changed since _sinceBlock, so return current
            bytes32 valueKey = bytes32(uint256(_key) + checkpointBlock);
            return getUint(valueKey) * shareScale;
        }
        // Calculate the current accumulator value
        bytes32 valueKey = bytes32(uint256(_key) + checkpointBlock);
        uint256 valueAtBlock = getUint(valueKey);
        uint256 blockDuration = (block.number - checkpointBlock);
        uint256 currentAccum = uint256(checkpointValue) + (valueAtBlock * blockDuration);
        // Calculate the accumulator at _sinceBlock
        (checkpointExists, checkpointBlock, checkpointValue) = _rocketNetworkSnapshots.lookupCheckpoint(_key, uint32(_sinceBlock));
        valueKey = bytes32(uint256(_key) + checkpointBlock);
        valueAtBlock = getUint(valueKey);
        blockDuration = (_sinceBlock - checkpointBlock);
        uint256 pastAccum = uint256(checkpointValue) + (valueAtBlock * blockDuration);
        // Calculate time-weighted average
        uint256 duration = (block.number - _sinceBlock);
        uint256 average = (currentAccum - pastAccum) / duration;
        return average * shareScale;
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
