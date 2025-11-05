// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketNetworkSnapshotsTimeInterface} from "../../interface/network/RocketNetworkSnapshotsTimeInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

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

    /// @dev Only allows calls from the pDAO setting contract
    modifier onlyProtocolDAO() {
        if(msg.sender != getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsNetwork")))) {
            revert("Invalid or outdated network contract");
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
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        (bool exists,,) = rocketNetworkSnapshotsTime.latest(nodeShareKey);
        require(!exists, "Already initialised");
        // Initialise node share
        bytes32 valueKey = bytes32(uint256(nodeShareKey) + block.timestamp);
        setUint(valueKey, _initialNodeShare / shareScale);
        rocketNetworkSnapshotsTime.push(nodeShareKey, 0);
        // Initialise voter share
        valueKey = bytes32(uint256(voterShareKey) + block.timestamp);
        setUint(valueKey, _initialVoterShare / shareScale);
        rocketNetworkSnapshotsTime.push(voterShareKey, 0);
        // Initialise pdao share
        valueKey = bytes32(uint256(protocolDAOShareKey) + block.timestamp);
        setUint(valueKey, _initialProtocolDAOShare / shareScale);
        rocketNetworkSnapshotsTime.push(protocolDAOShareKey, 0);
    }

    /// @notice Returns the current node share value
    function getCurrentNodeShare() external override view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        return _getCurrentShare(rocketNetworkSnapshotsTime, nodeShareKey, false);
    }

    /// @notice Returns the current voter share value
    function getCurrentVoterShare() external override view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        return _getCurrentShare(rocketNetworkSnapshotsTime, voterShareKey, false);
    }

    /// @notice Returns the current pDAO share value
    function getCurrentProtocolDAOShare() external override view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        return _getCurrentShare(rocketNetworkSnapshotsTime, protocolDAOShareKey, false);
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

    /// @notice Called by a pDAO governance contract to update the `pdao_share` parameter
    /// @param _newShare The value to set the `pdao_share` to
    function setProtocolDAOShare(uint256 _newShare) external override onlyProtocolDAO {
        _setShare(protocolDAOShareKey, _newShare);
    }

    /// @notice Calculates the time-weighted average revenue split values between the supplied timestamp and now
    /// @param _sinceTime The starting block timestamp for the calculation
    function calculateSplit(uint256 _sinceTime) external override view returns (uint256 nodeShare, uint256 voterShare, uint256 protocolDAOShare, uint256 rethShare) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        if (_sinceTime == block.timestamp) {
            nodeShare = _getCurrentShare(rocketNetworkSnapshotsTime, nodeShareKey, true);
            voterShare = _getCurrentShare(rocketNetworkSnapshotsTime, voterShareKey, true);
            protocolDAOShare = _getCurrentShare(rocketNetworkSnapshotsTime, protocolDAOShareKey, true);
        } else {
            require(_sinceTime < block.timestamp, "Time must be in the past");
            nodeShare = _getAverageSince(rocketNetworkSnapshotsTime, _sinceTime, nodeShareKey, true);
            voterShare = _getAverageSince(rocketNetworkSnapshotsTime, _sinceTime, voterShareKey, true);
            protocolDAOShare = _getAverageSince(rocketNetworkSnapshotsTime, _sinceTime, protocolDAOShareKey, true);
        }
        uint256 rethCommission = nodeShare + voterShare + protocolDAOShare;
        rethShare = 1 ether - rethCommission;
        return (nodeShare, voterShare, protocolDAOShare, rethShare);
    }

    /// @notice Called by a Megapool when its capital ratio changes to keep track of average
    /// @param _nodeAddress Address of the node operator
    /// @param _value New capital ratio
    function setNodeCapitalRatio(address _nodeAddress, uint256 _value) external override onlyRegisteredMegapool(msg.sender) onlyLatestContract("rocketNetworkRevenues", address(this)) {
        // Compute the key
        bytes32 key = keccak256(abi.encodePacked("node.capital.ratio", _nodeAddress));
        // Get the existing value
        bytes32 valueKey = bytes32(uint256(key) + block.timestamp);
        uint256 existingValue = getUint(valueKey);
        // Don't store an entry if the capital ratio hasn't changed
        if (existingValue != _value)  {
            _setShare(key, _value);
        }
    }

    /// @notice Returns the current capital ratio of the given node operator
    /// @param _nodeAddress Address of the node operator to query the value for
    function getNodeCapitalRatio(address _nodeAddress) external override view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        bytes32 key = keccak256(abi.encodePacked("node.capital.ratio", _nodeAddress));
        return _getCurrentShare(rocketNetworkSnapshotsTime, key, false);
    }

    /// @notice Returns the average capital ratio of the given node operator since a given block
    /// @param _nodeAddress Address of the node operator to query the value for
    /// @param _sinceTime The timestamp to calculate the average since
    function getNodeAverageCapitalRatioSince(address _nodeAddress, uint256 _sinceTime) external override view returns (uint256) {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        bytes32 key = keccak256(abi.encodePacked("node.capital.ratio", _nodeAddress));
        if (_sinceTime == block.timestamp) {
           return _getCurrentShare(rocketNetworkSnapshotsTime, key, false);
        } else {
            require(_sinceTime < block.timestamp, "Time must be in the past");
            return _getAverageSince(rocketNetworkSnapshotsTime, _sinceTime, key, false);
        }
    }

    /// @notice Calculates the time-weighted average since a given block
    function _getAverageSince(RocketNetworkSnapshotsTimeInterface _rocketNetworkSnapshotsTime, uint256 _sinceTime, bytes32 _key, bool _mustExist) internal view returns (uint256) {
        (bool checkpointExists, uint64 checkpointTime, uint192 checkpointValue) = _rocketNetworkSnapshotsTime.latest(_key);
        require(!_mustExist || checkpointExists, "Snapshot does not exist");
        if (!checkpointExists) return 0;
        if (checkpointTime <= _sinceTime) {
            // Value hasn't changed since _sinceTime, so return current
            bytes32 valueKey = bytes32(uint256(_key) + checkpointTime);
            return getUint(valueKey) * shareScale;
        }
        // Calculate the current accumulator value
        bytes32 valueKey = bytes32(uint256(_key) + checkpointTime);
        uint256 valueAtTime = getUint(valueKey);
        uint256 durationSinceCheckpoint = (block.timestamp - checkpointTime);
        uint256 currentAccum = uint256(checkpointValue) + (valueAtTime * durationSinceCheckpoint);
        // Calculate the accumulator at _sinceTime
        (checkpointExists, checkpointTime, checkpointValue) = _rocketNetworkSnapshotsTime.lookupCheckpoint(_key, uint64(_sinceTime));
        valueKey = bytes32(uint256(_key) + checkpointTime);
        valueAtTime = getUint(valueKey);
        durationSinceCheckpoint = (_sinceTime - checkpointTime);
        uint256 pastAccum = uint256(checkpointValue) + (valueAtTime * durationSinceCheckpoint);
        // Calculate time-weighted average
        uint256 durationSince = (block.timestamp - _sinceTime);
        uint256 average = (currentAccum - pastAccum) / durationSince;
        return average * shareScale;
    }

    /// @dev Calculates the cumulative value of the accumulator at a given timestamp
    function _getAccumulatorAt(RocketNetworkSnapshotsTimeInterface _rocketNetworkSnapshotsTime, bytes32 _key, uint256 _time, bool _mustExist) internal view returns (uint256) {
        (bool checkpointExists, uint64 checkpointTime, uint192 checkpointValue) = _rocketNetworkSnapshotsTime.lookupCheckpoint(_key, uint64(_time));
        require(!_mustExist || checkpointExists, "Snapshot does not exist");
        if (!checkpointExists) return 0;
        bytes32 valueKey = bytes32(uint256(_key) + checkpointTime);
        uint256 valueAtTime = getUint(valueKey);
        uint256 timeDuration = (_time - checkpointTime);
        return uint256(checkpointValue) + (valueAtTime * timeDuration);
    }

    /// @dev Convenience method to return the current value given a key
    function _getCurrentShare(RocketNetworkSnapshotsTimeInterface _rocketNetworkSnapshotsTime, bytes32 _key, bool _mustExist) internal view returns (uint256) {
        (bool exists, uint64 timestamp, ) = _rocketNetworkSnapshotsTime.latest(_key);
        require(!_mustExist || exists, "Snapshot does not exist");
        if (!exists) return 0;
        bytes32 valueKey = bytes32(uint256(_key) + timestamp);
        return getUint(valueKey) * shareScale;
    }

    /// @dev Sets the share value of the given key
    /// @param _key Key of the share value to set
    /// @param _newShare Value to set it to
    function _setShare(bytes32 _key, uint256 _newShare) internal {
        RocketNetworkSnapshotsTimeInterface rocketNetworkSnapshotsTime = RocketNetworkSnapshotsTimeInterface(getContractAddress("rocketNetworkSnapshotsTime"));
        uint256 currentAccum = _getAccumulatorAt(rocketNetworkSnapshotsTime, _key, block.timestamp, false);
        rocketNetworkSnapshotsTime.push(_key, uint192(currentAccum));
        uint256 newShareScaled = _newShare / shareScale;
        bytes32 valueKey = bytes32(uint256(_key) + block.timestamp);
        setUint(valueKey, newShareScaled);
    }
}
