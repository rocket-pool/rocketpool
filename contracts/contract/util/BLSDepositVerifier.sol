// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {BLS12_381} from "./bls/BLS.sol";
import {BLSPointDecoder} from "./bls/BLSPointDecoder.sol";
import {BLSSubgroupChecks} from "./bls/BLSSubgroupChecks.sol";
import {BLSDepositVerifierInterface} from "../../interface/util/BLSDepositVerifierInterface.sol";

/// @notice Stateless Ethereum deposit-signature verification from compressed bytes only.
/// @dev Invalid encodings, curve points, subgroups and signatures return false. Execution errors revert.
/// Callers must authenticate every input before treating false as evidence of a violation.
contract BLSDepositVerifier is BLSDepositVerifierInterface {

    address constant internal BLS12_PAIRING_CHECK = address(0x0f);

    bytes32 public immutable depositDomain;

    /// @param _genesisForkVersion GENESIS_FORK_VERSION, not the current consensus fork
    constructor(bytes4 _genesisForkVersion) {
        depositDomain = BLS12_381.computeDepositDomain(_genesisForkVersion);
    }

    /// @notice Verify the signature of a deposit whose amount is expressed in gwei
    /// @param _pubkey Validator pubkey of the deposit
    /// @param _withdrawalCredentials Withdrawal credentials of the deposit
    /// @param _amountGwei Deposit amount in gwei of the deposit
    /// @param _signature Compressed BLS signature over the deposit signing root
    function verifyDepositSignature(
        bytes calldata _pubkey,
        bytes32 _withdrawalCredentials,
        uint64 _amountGwei,
        bytes calldata _signature
    ) override external view returns (bool) {
        // Validate input lengths
        if (_pubkey.length != 48 || _signature.length != 96) {
            return false;
        }
        // Construct signing root from deposit data
        bytes32 signingRoot = BLS12_381.depositMessageSigningRoot(
            _pubkey, uint256(_amountGwei) * 1 gwei, _withdrawalCredentials, depositDomain
        );
        // Verify signature
        return _verify(signingRoot, _pubkey, _signature);
    }

    /// @notice Verify an Ethereum POP signature over an already constructed signing root
    function verifySignature(bytes32 _signingRoot, bytes calldata _pubkey, bytes calldata _signature)
        external view returns (bool) {
        return _verify(_signingRoot, _pubkey, _signature);
    }

    /// @dev Internal implementation of BLS12-381 signature verification logic
    function _verify(bytes32 signingRoot, bytes calldata pubkey, bytes calldata signature) private view returns (bool) {
        // Validate input lengths
        if (pubkey.length != 48 || signature.length != 96) {
            return false;
        }
        // Recover pubkey point in G1 (PK)
        (bool validPublicKey, uint256[4] memory publicPoint) = BLSPointDecoder.decodeG1(pubkey);
        if (!validPublicKey || !BLSSubgroupChecks.g1(publicPoint)) {
            return false;
        }
        // Recover signature point in G2 (σ)
        (bool validSignaturePoint, uint256[8] memory signaturePoint) = BLSPointDecoder.decodeG2(signature);
        if (!validSignaturePoint || !BLSSubgroupChecks.g2(signaturePoint)){
            return false;
        }
        // Compute negative generator (-P)
        uint256[4] memory negativeGenerator = BLSSubgroupChecks._generatorG1();
        negativeGenerator[2] = 0x114d1d6855d545a8aa7d76c8cf2e21f2;
        negativeGenerator[3] = 0x67816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca;
        // Hash signing root to G2 (Q)
        BLS12_381.G2Point memory messagePoint = BLS12_381.hashToG2(signingRoot);
        // Compute and return `e(PK, Q) . e(-P, σ) == 1`
        return _pairing(abi.encode(publicPoint, messagePoint, negativeGenerator, signaturePoint));
    }

    /// @dev Executes BLS12 pairing check precompile
    function _pairing(bytes memory input) internal view returns (bool) {
        (bool success, bytes memory result) = BLS12_PAIRING_CHECK.staticcall(input);
        if (!success || result.length != 32) {
            revert("Pairing execution failed");
        }
        uint256 paired = abi.decode(result, (uint256));
        if (paired > 1) {
            revert("Pairing execution failed");
        }
        return paired == 1;
    }
}
