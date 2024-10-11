// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {RocketMegapoolDelegateBaseInterface} from "./RocketMegapoolDelegateBaseInterface.sol";

interface RocketMegapoolDelegateInterface is RocketMegapoolDelegateBaseInterface {
    struct StateProof {
        bytes data;
    }

    function newValidator(uint256 bondAmount, bool useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function dequeue(uint32 validatorId) external;
    function assignFunds(uint32 validatorId) external payable;
    function stake(uint32 validatorId, bytes calldata pubKey, bytes calldata signature, bytes32 depositDataRoot, StateProof calldata withdrawalCredentialStateProof) external;
    function getNodeAddress() external returns (address);
}