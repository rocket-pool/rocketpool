// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {SlotProof, ParticipationProof, ValidatorProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketNetworkParticipationInterface {
    enum ChallengeType { None, Megapool, Minipool }

    function getChallengeBondDetails(uint256 _challengeId) external view returns (address proposer, address responder, uint256 bondAmount, uint256 responseDeadline, bool settled);
    function getChallengeValidatorIds(uint256 _challengeId) external view returns (uint32[] memory);
    function getChallengeMinipools(uint256 _challengeId) external view returns (address[] memory);
    function getChallengeType(uint256 _challengeId) external view returns (ChallengeType);

    function releaseChallengeBond(uint256 _challengeId) external;
    function claimChallengeReward(uint256 _challengeId) external;
    function challengeMinipools(address[] calldata _minipoolAddresses, uint64 _startEpoch, uint256[] calldata _participation, uint64 _slotTimestamp, SlotProof calldata _slotProof) external;
    function respondWithMinipoolValidator(uint256 _challengeId, address _minipoolAddress, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) external;
    function respondWithMinipoolParticipation(uint256 _challengeId, address _minipoolAddress, uint64 _offset, uint256 _challengeLeaf, bytes32[] calldata _challengeWitness, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, ParticipationProof calldata _participationProof, SlotProof calldata _slotProof) external;
    function challengeMegapool(address _megapoolAddress, uint32[] calldata _validatorIds, uint64 _startEpoch, uint256[] calldata _participation, uint64 _slotTimestamp, SlotProof calldata _slotProof) external;
    function respondWithMegapoolParticipation(uint256 _challengeId, uint32 _validatorId, uint64 _offset, uint256 _challengeLeaf, bytes32[] calldata _challengeWitness, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, ParticipationProof calldata _participationProof, SlotProof calldata _slotProof) external;
    function respondWithMegapoolValidator(uint256 _challengeId, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) external;
    function finaliseChallenge(uint256 _challengeId) external;
}
