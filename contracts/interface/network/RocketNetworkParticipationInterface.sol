// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {SlotProof, ParticipationProof, ValidatorProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketNetworkParticipationInterface {
    function challengeMegapool(address _megapoolAddress, uint32 _validatorId, uint64 _startEpoch, uint256[] calldata _participation, uint64 _slotTimestamp, SlotProof calldata _slotProof) external;
    function respondWithParticipation(uint256 _challengeId, uint64 _offset, uint256 _challengeLeaf, bytes32[] calldata _challengeWitness, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, ParticipationProof calldata _participationProof, SlotProof calldata _slotProof) external;
    function finaliseChallenge(uint256 _challengeId) external;
}
