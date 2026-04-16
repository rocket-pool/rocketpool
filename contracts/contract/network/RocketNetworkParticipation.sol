// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketNetworkExitInterface} from "../../interface/network/RocketNetworkExitInterface.sol";
import {RocketNetworkParticipationInterface} from "../../interface/network/RocketNetworkParticipationInterface.sol";
import {SlotProof, BeaconStateVerifierInterface, ValidatorProof, ParticipationProof} from "../../interface/util/BeaconStateVerifierInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolStorageLayout} from "../megapool/RocketMegapoolStorageLayout.sol";

contract RocketNetworkParticipation is RocketBase, RocketNetworkParticipationInterface {
    event MegapoolChallenged(address indexed megapoolAddress, uint256 indexed _validatorId, uint256 _challengeId, uint64 _startSlot, bytes32 _root, uint256[] _participation);
    event MegapoolChallengeDefeated(uint256 _challengeId);

    uint64 constant internal slotsPerEpoch = 32;
    uint256 constant internal slotRecencyThreshold = 1 hours;
    uint8 constant internal timelyTargetFlag = 1 << 1;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Submit a challenge against a Megapool validator accusing them of falling under the participation requirements
    /// @param _megapoolAddress Address of the Megapool with the challenged validator
    /// @param _validatorId Internal ID of the validator being challenged
    /// @param _startEpoch The first epoch of the range of epochs where participation dropped below the requirement
    /// @param _participation A bitmap of each epoch from _startEpoch encoding the epochs that the validator did not meet requirements
    /// @param _slotTimestamp Timestamp of the slot the slot proof was generated against
    /// @param _slotProof Proof of a recent slot number
    function challengeMegapool(
        address _megapoolAddress,
        uint32 _validatorId,
        uint64 _startEpoch,
        uint256[] calldata _participation,
        uint64 _slotTimestamp,
        SlotProof calldata _slotProof
    ) external onlyRegisteredMegapool(_megapoolAddress) {
        // Check global enable state
        require(getPerformanceExitsEnabled(), "Performance exits disabled");
        // Check proof recency requirement
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        {
            // Check validator is in a valid challengable state (this also confirms _validatorId exists)
            RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(_megapoolAddress);
            RocketMegapoolStorageLayout.ValidatorInfo memory validator = megapool.getValidatorInfo(_validatorId);
            require(validator.staked, "Validator not staked");
            require(!validator.exiting, "Already exiting");
            require(!validator.exited, "Already exited");
        }
        {
            // Check an exit request doesn't already exist
            RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
            require(networkExit.getMegapoolCooperativeExitStart(_megapoolAddress, _validatorId) == 0, "Exit has already been requested");
        }
        uint256 currentEpoch = _slotProof.slot / slotsPerEpoch;
        {
            // Verify slot proof and check challenged start epoch is is old enough
            BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
            require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
            require(_startEpoch < currentEpoch, "Challenge starts in future");
            require(_startEpoch + getPerformancePeriod() + getProofBuffer() > currentEpoch, "Challenge too recent");
        }
        // Setup the challenge
        bytes32 root = hashTree(_participation);
        uint256 challengeId = getUint(keccak256("megapool.challenge.count")) + 1;
        uint256 period = getPerformancePeriod();
        {
            uint256 elapsedEpochs = currentEpoch - _startEpoch;
            uint256 challengeableEpochs = elapsedEpochs < period ? elapsedEpochs : period;
            require(_validateParticipationBitmap(period, challengeableEpochs, _participation), "Invalid participation bitmap");
        }
        // The hamming weight is the number of 1s in the bitmap which is the number of epochs the validator failed participation requirements
        uint256 failedEpochs = calculateHammingWeight(_participation);
        require(failedEpochs >= getMinimumPerformanceRequirement(period), "Participation is above requirement");
        // Store challenge
        setUint(keccak256(abi.encodePacked("megapool.challenge.count")), challengeId);
        setBytes32(keccak256(abi.encodePacked("megapool.challenge.root", challengeId)), root);
        setUint(keccak256(abi.encodePacked("megapool.challenge.time", challengeId)), block.timestamp);
        setUint(keccak256(abi.encodePacked("megapool.challenge.start", challengeId)), _startEpoch);
        setUint(keccak256(abi.encodePacked("megapool.challenge.period", challengeId)), period);
        setAddress(keccak256(abi.encodePacked("megapool.challenge.address", challengeId)), _megapoolAddress);
        setUint(keccak256(abi.encodePacked("megapool.challenge.validatorId", challengeId)), _validatorId);
        // Emit event
        emit MegapoolChallenged(_megapoolAddress, _validatorId, challengeId, _startEpoch, root, _participation);
    }

    /// @notice Allows a NO to respond to a challenge showing their validator was not staking for the entire challenge period
    function respondWithValidator(
        uint256 _challengeId,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        SlotProof calldata _slotProof
    ) external {
        // Challenge expiry check
        requireAliveChallenge(_challengeId);
        // Check proof recency requirement
        require(_slotTimestamp + slotRecencyThreshold >= block.timestamp, "Slot proof too old");
        // Get challenge details
        uint256 startEpoch = getUint(keccak256(abi.encodePacked("megapool.challenge.start", _challengeId)));
        uint256 period = getUint(keccak256(abi.encodePacked("megapool.challenge.period", _challengeId)));
        // Validate verifier state
        require(
            _validatorProof.validator.activationEpoch > startEpoch ||
            _validatorProof.validator.withdrawableEpoch <= startEpoch + period,
            "Validator was staking during challenge period"
        );
        // Verify proof was for the challenged validator
        address megapoolAddress = getAddress(keccak256(abi.encodePacked("megapool.challenge.address", _challengeId)));
        uint32 validatorId = uint32(getUint(keccak256(abi.encodePacked("megapool.challenge.validatorId", _challengeId))));
        RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(megapoolAddress);
        bytes memory pubkey = megapool.getValidatorPubkey(validatorId);
        require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Incorrect validator");
        // Verify validator state via beacon state proof
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
        // Defeat the challenge
        defeatChallenge(_challengeId);
    }

    /// @notice Allows a NO to respond to a challenge with a proof of fraud
    /// @param _challengeId ID of the challenge
    /// @param _offset Offset from the start epoch to the epoch with fraud
    /// @param _challengeLeaf The leaf node containing the offset from the challenge merkle tree
    /// @param _challengeWitness Proof that the challenge leaf is contained in the challenge merkle tree
    /// @param _slotTimestamp Slot which the beacon state proof was generated against
    /// @param _validatorProof Beacon state proof of the validator
    /// @param _participationProof Beacon state proof of the fraud
    /// @param _slotProof Proof of the slot number the participation proof was generated against
    function respondWithParticipation(
        uint256 _challengeId,
        uint64 _offset,
        uint256 _challengeLeaf,
        bytes32[] calldata _challengeWitness,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) external {
        // Challenge expiry check
        requireAliveChallenge(_challengeId);
        // Get challenge data
        bytes32 root = getBytes32(keccak256(abi.encodePacked("megapool.challenge.root", _challengeId)));
        uint256 startEpoch = getUint(keccak256(abi.encodePacked("megapool.challenge.start", _challengeId)));
        uint256 period = getUint(keccak256(abi.encodePacked("megapool.challenge.period", _challengeId)));
        // Response must be for an epoch within the challenge window
        require(_offset < period, "Epoch too high");
        // Participation flags must show that participation did actually occur at the challenged epoch
        require(validateParticipationFlags(_participationProof.participationFlags), "Invalid participation");
        // Response must be to an epoch that was actually marked as missed
        {
            uint256 participationBit = _offset % 256;
            uint256 participationMask = uint256(1) << participationBit;
            require((_challengeLeaf & participationMask) != 0, "Epoch not challenged");
        }
        // Prove the epoch referred to by this offset was actually challenged
        {
            uint256 leafIndex = _offset / 256;
            uint256 leafCount = (period + 255) / 256;
            uint256 merklePath = nextPowerOfTwo(leafCount) + leafIndex;
            bytes32 restoredRoot = restoreMerkleRoot(bytes32(_challengeLeaf), merklePath, _challengeWitness);
            require(restoredRoot == root, "Invalid challenge proof");
        }
        // Calculate the expected slot for the proof (must be the 1st slot of the epoch following the challenged epoch)
        uint256 challengedEpoch = startEpoch + _offset;
        uint256 proofEpoch = _participationProof.participationSlot / slotsPerEpoch;
        require(proofEpoch == challengedEpoch + 1, "Invalid slot");
        // Verify via beacon state proof that participation did actually occur
        verifyParticipationResponseProofs(_challengeId, _slotTimestamp, _validatorProof, _participationProof, _slotProof);
        // Defeat the challenge
        defeatChallenge(_challengeId);
    }

    /// @dev Verifies all the relevant proofs for a participation response
    function verifyParticipationResponseProofs(
        uint256 _challengeId,
        uint64 _slotTimestamp,
        ValidatorProof calldata _validatorProof,
        ParticipationProof calldata _participationProof,
        SlotProof calldata _slotProof
    ) internal view {
        require(_validatorProof.validatorIndex == _participationProof.validatorIndex, "Incorrect validator index");
        {
            address megapoolAddress = getAddress(keccak256(abi.encodePacked("megapool.challenge.address", _challengeId)));
            uint32 validatorId = uint32(getUint(keccak256(abi.encodePacked("megapool.challenge.validatorId", _challengeId))));
            RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(megapoolAddress);
            bytes memory pubkey = megapool.getValidatorPubkey(validatorId);
            require(keccak256(_validatorProof.validator.pubkey) == keccak256(pubkey), "Incorrect validator");
        }
        BeaconStateVerifierInterface beaconStateVerifier = BeaconStateVerifierInterface(getContractAddress("beaconStateVerifier"));
        require(beaconStateVerifier.verifyValidator(_slotTimestamp, _slotProof.slot, _validatorProof), "Invalid validator proof");
        require(beaconStateVerifier.verifyParticipation(_slotTimestamp, _slotProof.slot, _participationProof), "Invalid participation proof");
        require(beaconStateVerifier.verifySlot(_slotTimestamp, _slotProof), "Invalid slot proof");
    }

    /// @notice Requests a Megapool validator to exit on a successful challenge
    /// @param _challengeId ID of the successful challenge
    function finaliseChallenge(uint256 _challengeId) override external {
        // Check challenge exists
        requireExistingChallenge(_challengeId);
        // Get challenge data
        uint256 challengeMadeTime = getUint(keccak256(abi.encodePacked("megapool.challenge.time", _challengeId)));
        uint256 challengePeriod = getParticipationChallengeTime();
        bool canceled = getBool(keccak256(abi.encodePacked("megapool.challenge.responded", _challengeId)));
        require(!canceled, "Challenge was defeated");
        require(challengeMadeTime + challengePeriod < block.timestamp, "Not enough time has passed");
        // Trigger force exit via network exit contract
        address megapoolAddress = getAddress(keccak256(abi.encodePacked("megapool.challenge.address", _challengeId)));
        uint32 validatorId = uint32(getUint(keccak256(abi.encodePacked("megapool.challenge.validatorId", _challengeId))));
        RocketNetworkExitInterface networkExit = RocketNetworkExitInterface(getContractAddress("rocketNetworkExit"));
        networkExit.requestMegapoolExit(megapoolAddress, validatorId);
    }

    function restoreMerkleRoot(bytes32 _leaf, uint256 _gindex, bytes32[] memory _witnesses) internal view returns (bytes32) {
        // Check for correct number of witnesses
        require(2 ** (_witnesses.length + 1) > _gindex, "Invalid witness length");
        bytes32 value = _leaf;
        uint256 i = 0;
        while (_gindex != 1) {
            if (_gindex % 2 == 1) {
                value = efficientSha256(_witnesses[i], value);
            } else {
                value = efficientSha256(value, _witnesses[i]);
            }
            _gindex /= 2;
            unchecked {
                i++;
            }
        }
        return value;
    }

    /// @dev Validate length and padding of a given participation bitmap
    /// @param _period The challenge period in epochs
    /// @param _challengeableEpochs The number of epochs which are actually challengable (lower than current epoch)
    /// @param _participationBitmap The participation bitmap
    function _validateParticipationBitmap(
        uint256 _period,
        uint256 _challengeableEpochs,
        uint256[] calldata _participationBitmap
    ) internal pure returns (bool) {
        uint256 expectedLength = (_period + 255) / 256;
        if (_participationBitmap.length != expectedLength) return false;
        if (_challengeableEpochs > _period) return false;

        uint256 fullWords = _challengeableEpochs / 256;
        uint256 remainder = _challengeableEpochs % 256;

        if (remainder != 0) {
            uint256 validBitsMask = (uint256(1) << remainder) - 1;
            if ((_participationBitmap[fullWords] & ~validBitsMask) != 0) return false;
            fullWords++;
        }

        for (uint256 i = fullWords; i < _participationBitmap.length; ++i) {
            if (_participationBitmap[i] != 0) return false;
        }

        return true;
    }

    /// @dev Returns true if performance exits are globally enabled
    function getPerformanceExitsEnabled() internal view returns (bool) {
        return getNetworkSettings().getPerformanceExitsEnabled();
    }

    function getParticipationChallengeTime() internal view returns (uint256) {
        return getNetworkSettings().getPerformanceChallengePeriod();
    }

    /// @dev Gets the performance measurement period in epochs
    function getPerformancePeriod() internal view returns (uint256) {
        return getNetworkSettings().getPerformancePeriod();
    }

    /// @dev Returns the number of epochs that must be missed for a challenge to be valid
    function getMinimumPerformanceRequirement(uint256 _period) internal view returns (uint256) {
        uint256 threshold = getNetworkSettings().getPerformanceThreshold();
        uint256 missed = _period * (calcBase - threshold);
        return (missed + calcBase - 1) / calcBase;
    }

    /// @dev Returns the buffer time (in epochs) for proofs to limit the age of performance challenges
    function getProofBuffer() internal view returns (uint256) {
        return getNetworkSettings().getPerformanceProofBuffer();
    }

    function getNetworkSettings() internal view returns (RocketDAOProtocolSettingsNetworkInterface) {
        return RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
    }

    function getForceExitFeeLimit() internal view returns (uint256) {
        // TODO: Decide how to handle this
        return 10 wei;
    }

    /// @dev Constructs a merkle tree from the given leaves and returns the root hash
    function hashTree(uint256[] calldata _leaves) internal view returns (bytes32) {
        uint256 leafCount = _leaves.length;
        require(leafCount != 0, "Invalid tree");

        uint256 width = nextPowerOfTwo(leafCount);
        bytes32[] memory tree = new bytes32[](width);

        for (uint256 i = 0; i < leafCount; ++i) {
            tree[i] = bytes32(_leaves[i]);
        }

        while (width > 1) {
            for (uint256 i = 0; i < width; i += 2) {
                tree[i / 2] = efficientSha256(tree[i], tree[i + 1]);
            }
            width /= 2;
        }

        return tree[0];
    }

    function nextPowerOfTwo(uint256 _value) internal pure returns (uint256) {
        require(_value != 0, "Invalid length");
        uint256 result = 1;
        while (result < _value) {
            require(result <= type(uint256).max / 2, "Length too large");
            result *= 2;
        }
        return result;
    }

    function validateParticipationFlags(uint8 _participationFlags) internal pure returns (bool) {
        return _participationFlags & timelyTargetFlag != 0;
    }

    function defeatChallenge(uint256 _challengeId) internal {
        // Cancel the challenge
        setBool(keccak256(abi.encodePacked("megapool.challenge.responded", _challengeId)), true);
        // Emit event
        emit MegapoolChallengeDefeated(_challengeId);
    }

    /// @dev Reverts if a challenge does not exists or has already expired
    function requireAliveChallenge(uint256 _challengeId) internal {
        uint256 challengeTime = getUint(keccak256(abi.encodePacked("megapool.challenge.time", _challengeId)));
        require(challengeTime != 0, "Invalid challenge");
        require(
            challengeTime + getParticipationChallengeTime() >= block.timestamp,
            "Challenge period has passed"
        );
    }

    /// @dev Reverts if a challenge does not exists
    function requireExistingChallenge(uint256 _challengeId) internal {
        uint256 challengeTime = getUint(keccak256(abi.encodePacked("megapool.challenge.time", _challengeId)));
        require(challengeTime != 0, "Invalid challenge");
    }

    /// @dev Computes the hamming weight of the given participation bitmap
    /// @param _participationBitmap The participation bitmap
    function calculateHammingWeight(uint256[] calldata _participationBitmap) internal pure returns (uint256) {
        // Kernighan algorithm is optimised for sparse bitmap hamming weight calculation
        uint256 count = 0;
        unchecked {
            for (uint256 i = 0; i < _participationBitmap.length; ++i) {
                uint256 x = _participationBitmap[i];

                while (x != 0) {
                    x &= x - 1; // clear lowest set bit
                    ++count;
                }
            }
        }
        return count;
    }

    /// @dev Concatenates two bytes32 values and returns a SHA256 of the result
    function efficientSha256(bytes32 _left, bytes32 _right) internal view returns (bytes32 ret) {
        assembly {
            mstore(0x00, _left)
            mstore(0x20, _right)

            let result := staticcall(gas(), 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0, 0)
            }

            ret := mload(0x00)
        }
    }
}
