pragma solidity 0.8.18;

//SPDX-License-Identifier: GPL-3.0-only

struct StateProof {
    bytes data;
}

interface RocketMegapoolInterface {

    function newValidator(uint256 bondAmount, bool useExpressTicket) external payable;
    function dequeue(uint32 validatorId) external;
    function assignFunds(uint32 validatorId) external payable;
    function preStake(uint32 validatorId, bytes calldata pubKey, bytes calldata withdrawalCredentials, bytes calldata signature, bytes32 depositDataRoot) external;
    function stake(uint32 validatorId, bytes calldata pubKey, bytes calldata signature, bytes32 depositDataRoot, StateProof calldata withdrawalCredentialStateProof) external;
    function getNodeAddress() external returns (address);
}