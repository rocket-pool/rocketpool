// SPDX-License-Identifier: MIT

pragma solidity ^0.8.25;

import {SSZ} from "../SSZ.sol";

/**
 * @notice Ethereum deposit SSZ/domain helpers and hash-to-G2, adapted from Lido BLS.sol.
 * @dev Uses the Cancun-only `mcopy` opcode; deployment requires an EVM with Cancun support.
 * @author Rocket Pool
 * @author Lido (https://github.com/lidofinance/core/blob/master/contracts/common/lib/BLS.sol)
 * @author Solady (https://github.com/Vectorized/solady/blob/dcdfab80f4e6cb9ac35c91610b2a2ec42689ec79/src/utils/ext/ithaca/BLS.sol)
 * @author Ithaca (https://github.com/ithacaxyz/odyssey-examples/blob/main/chapter1/contracts/src/libraries/BLS.sol)
 */
// solhint-disable contract-name-capwords
library BLS12_381 {
    /// @dev A representation of a point on the G2 curve of BLS12-381.
    struct G2Point {
        bytes32 x_c0_a;
        bytes32 x_c0_b;
        bytes32 x_c1_a;
        bytes32 x_c1_b;
        bytes32 y_c0_a;
        bytes32 y_c0_b;
        bytes32 y_c1_a;
        bytes32 y_c1_b;
    }

    // Deposit domain and precompile addresses (EIP-2537 / EIP-198).
    bytes4 internal constant DOMAIN_DEPOSIT_TYPE = 0x03000000;
    address internal constant SHA256 = 0x0000000000000000000000000000000000000002;
    address internal constant MOD_EXP = 0x0000000000000000000000000000000000000005;
    address internal constant BLS12_G2ADD = 0x000000000000000000000000000000000000000d;
    address internal constant BLS12_MAP_FP2_TO_G2 = 0x0000000000000000000000000000000000000011;

    error G2AddFailed();
    error Sha256PrecompileFailed();
    error ModExpPrecompileFailed();
    error MapFp2ToG2Failed();
    error InvalidPubkeyLength();
    error InvalidDepositAmount();

    /**
     * @notice Computes a point in G2 from a message. Modified to accept bytes32 and have DST per ETH 2.0 spec
     * @param message the message to hash and map to G2 point on BLS curve
     * @dev original at https://github.com/Vectorized/solady/blob/dcdfab80f4e6cb9ac35c91610b2a2ec42689ec79/src/utils/ext/ithaca/BLS.sol#L275
     * @dev added comments and modified to use bytes32 instead of bytes and correct DST per https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/beacon-chain.md#bls-signatures
     *  */
    function hashToG2(bytes32 message) internal view returns (G2Point memory result) {
        /// @solidity memory-safe-assembly
        assembly {
            /// @dev Writes `I2OSP(i_, 1) || DST || I2OSP(len(DST), 1)` (total 45 bytes) to `o_`.
            function dstPrime(o_, i_) -> _o {
                mstore8(o_, i_) // `i_` (counter/index)
                mstore(add(o_, 0x01), "BLS_SIG_BLS12381G2_XMD:SHA-256_S") // DST (part 1, 32 bytes)
                mstore(add(o_, 0x21), "SWU_RO_POP_\x2b") // DST (part 2, 11 bytes) + len(DST)=43 => 0x2b
                _o := add(0x2d, o_) // Return pointer after the 45 bytes
            }

            /// @dev Calls SHA256 precompile with `data_` of length `n_`, returns 32-byte hash
            function sha2(data_, n_) -> _h {
                let success := staticcall(gas(), SHA256, data_, n_, 0x00, 0x20)
                if iszero(and(success, eq(returndatasize(), 0x20))) {
                    mstore(0x00, 0xdd5cab3e) // Revert with Sha256PrecompileFailed()
                    revert(0x1c, 0x04)
                }
                _h := mload(0x00) // Load and return hash result
            }

            /// @dev Modular reduction using MOD_EXP precompile: computes `base^1 mod p` i.e. `base mod p`.
            /// @param s_ Pointer to the MOD_EXP input buffer:
            ///        [baseLen|expLen|modLen|base(64)|exp(32)=1|mod(64)=p] (total 0x100 bytes).
            /// @param b_ Pointer to the 64-byte big-endian `base` value (overwritten with the reduced value).
            function modfield(s_, b_) {
                mcopy(add(s_, 0x60), b_, 0x40) // Copy base (64 bytes) into structure
                let success := staticcall(gas(), MOD_EXP, s_, 0x100, b_, 0x40)
                if iszero(and(success, eq(returndatasize(), 0x40))) {
                    mstore(0x00, 0x907060ec) // Revert with ModExpPrecompileFailed()
                    revert(0x1c, 0x04)
                }
            }

            /// @dev Map an fp2 field element to a point in G2 curve using BLS12_MAP_FP2_TO_G2 precompile
            function mapToG2(s_, r_) {
                if iszero(
                    and(eq(returndatasize(), 0x100), staticcall(gas(), BLS12_MAP_FP2_TO_G2, s_, 0x80, r_, 0x100))
                ) {
                    mstore(0x00, 0x89083b91) // Revert with MapFp2ToG2Failed()
                    revert(0x1c, 0x04)
                }
            }

            // === Begin Main Logic ===

            let b := mload(0x40) // Allocate free memory pointer `b`
            // Use scratch space for hashing buffers; we intentionally do not update the free memory pointer because
            // the bytes are only needed within this assembly block and nothing is persisted beyond it.
            let s := add(b, 0x100) // Pointer to working buffer after `b`
            mstore(add(s, 0x40), message) // Store the message at `s + 0x40`
            let o := add(add(s, 0x40), 0x20) // Pointer after message
            mstore(o, shl(240, 256)) // Store 256 as 2-byte BE (0x0100), padded left

            // === DST prime and initial hash ===
            let b0 := sha2(s, sub(dstPrime(add(0x02, o), 0), s)) // First SHA2 with DST index 0
            mstore(s, b0) // Store b0 at start of buffer
            mstore(b, sha2(s, sub(dstPrime(add(0x20, s), 1), s))) // Store next hash at `b`

            // === XOF-style hash chaining ===
            let j := b // Pointer to next position in output chain
            for {
                let i := 2
            } 1 {

            } {
                // XOR `b0` with previous output and hash it
                mstore(s, xor(b0, mload(j)))
                j := add(j, 0x20)
                mstore(j, sha2(s, sub(dstPrime(add(0x20, s), i), s))) // SHA2 with DST index `i`
                i := add(i, 1)
                if eq(i, 9) {
                    break
                } // Loop from i = 2 to i = 8 (7 iterations)
            }

            // === Prepare MOD_EXP input structure ===
            // MOD_EXP input layout:
            // baseLen(0x40) | expLen(0x20) | modLen(0x40) | base(0x40) | exp(0x20) | mod(0x40)
            // We set exp = 1 so MOD_EXP performs a modular reduction: base^1 mod p == base mod p.

            // Set up lengths
            mstore(add(s, 0x00), 0x40) // baseLen = 64
            mstore(add(s, 0x20), 0x20) // expLen = 32
            mstore(add(s, 0x40), 0x40) // modLen = 64

            // Exponent (1) and modulus (p) for BLS12-381 base field
            mstore(add(s, 0xa0), 1) // exp = 1 (big-endian, left-padded to expLen)
            mstore(add(s, 0xc0), 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7)
            mstore(add(s, 0xe0), 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab)

            // Modular reduction on each 64-byte chunk at b, b+0x40, b+0x80, b+0xc0
            modfield(s, add(b, 0x00))
            modfield(s, add(b, 0x40))
            modfield(s, add(b, 0x80))
            modfield(s, add(b, 0xc0))

            // Map two fp2 elements to G2
            mapToG2(b, result) // result at offset 0
            mapToG2(add(0x80, b), add(0x100, result)) // second point at result + 0x100

            // Add the two G2 points together with BLS12_G2ADD precompile
            if iszero(and(eq(returndatasize(), 0x100), staticcall(gas(), BLS12_G2ADD, result, 0x200, result, 0x100))) {
                mstore(0x00, 0xc55e5e33) // Revert with G2AddFailed()
                revert(0x1c, 0x04)
            }
        }
    }

    /// @notice Extracted part from `SSZ.verifyProof` for hashing two leaves
    /// @dev Combines 2 bytes32 in 64 bytes input for sha256 precompile
    function sha256Pair(bytes32 left, bytes32 right) internal view returns (bytes32 result) {
        /// @solidity memory-safe-assembly
        assembly {
            // Store `left` at memory position 0x00
            mstore(0x00, left)
            // Store `right` at memory position 0x20
            mstore(0x20, right)

            // Call SHA-256 precompile with 64-byte input at memory 0x00.
            let success := staticcall(gas(), SHA256, 0x00, 0x40, 0x00, 0x20)
            if iszero(and(success, eq(returndatasize(), 0x20))) {
                mstore(0x00, 0xdd5cab3e) // Revert with Sha256PrecompileFailed()
                revert(0x1c, 0x04)
            }

            // Load the resulting hash from memory
            result := mload(0x00)
        }
    }

    /// @notice Extracted and modified part from `SSZ.hashTreeRoot` for hashing validator pubkey from calldata
    /// @dev Reverts if `pubkey` length is not 48
    function pubkeyRoot(bytes calldata pubkey) internal view returns (bytes32 _pubkeyRoot) {
        if (pubkey.length != 48) revert InvalidPubkeyLength();

        /// @solidity memory-safe-assembly
        assembly {
            // Zero scratch space [0x20..0x3f] so bytes [48..63] are zero after copying a 48-byte pubkey.
            mstore(0x20, 0)
            // Copy 48 bytes of `pubkey` to start of scratch space
            calldatacopy(0x00, pubkey.offset, 48)

            // Call the SHA-256 precompile with the 64-byte input.
            let success := staticcall(gas(), SHA256, 0x00, 0x40, 0x00, 0x20)
            if iszero(and(success, eq(returndatasize(), 0x20))) {
                mstore(0x00, 0xdd5cab3e) // Revert with Sha256PrecompileFailed()
                revert(0x1c, 0x04)
            }

            // Load the resulting SHA-256 hash
            _pubkeyRoot := mload(0x00)
        }
    }

    /// @notice calculation of deposit domain based on fork version
    /// @dev per https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/beacon-chain.md#compute_domain
    function computeDepositDomain(bytes4 genesisForkVersion) internal view returns (bytes32 depositDomain) {
        bytes32 forkDataRoot = sha256Pair(genesisForkVersion, bytes32(0));
        depositDomain = DOMAIN_DEPOSIT_TYPE | (forkDataRoot >> 32);
    }

    /**
     * @notice calculates the signing root for deposit message
     * @dev per https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/beacon-chain.md#compute_signing_root
     * @dev should not be confused with `depositDataRoot`, used for verifying BLS deposit signature
     * @dev Reverts with `InvalidDepositAmount` if `amount` is not gwei-aligned.
     */
    function depositMessageSigningRoot(
        bytes calldata pubkey,
        uint256 amount,
        bytes32 withdrawalCredentials,
        bytes32 depositDomain
    ) internal view returns (bytes32 root) {
        if (amount % 1 gwei != 0) revert InvalidDepositAmount();
        root = sha256Pair(
            // merkle root of the deposit message
            sha256Pair(
                sha256Pair(
                    // pubkey must be hashed to be used as leaf
                    pubkeyRoot(pubkey),
                    withdrawalCredentials
                ),
                sha256Pair(
                    SSZ.toLittleEndian(amount / 1 gwei),
                    // filler to make leaf count power of 2
                    bytes32(0)
                )
            ),
            depositDomain
        );
    }
}
