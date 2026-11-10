// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {BLSField as F} from "./BLSField.sol";

/// @notice Ethereum compressed-point decoding; infinity is invalid for deposits.
/// @dev Field and curve equations follow EIP-2537. Encoding follows Ethereum's
/// BLS serialisation: compression/infinity/sign in the first three bits; G2 X
/// has imaginary then real coefficients. Subgroup checking is separate.
library BLSPointDecoder {

    /// @notice Decodes a point from the G1 subgroup
    /// @param _encoded A compressed G1 point
    /// @return valid Whether the result is a valid point in the G1 subgroup
    /// @return point The uncompressed G1 point
    function decodeG1(bytes calldata _encoded) internal view returns (bool valid, uint256[4] memory point) {
        // Validate encoded input
        if (!_header(_encoded, 48)) {
            return (false, point);
        }
        // Extract G1 x-coordinate
        F.Fp memory x = _coordinate(_encoded, 0, true);
        // Ensure point is canonical and non-zero
        if (!F.canonical(x) || F.isZero(x)) {
            return (false, point);
        }
        // Find y
        F.Fp memory rhs = F.add(F.multiply(F.square(x), x), F.Fp(0, 4));
        (bool exists, F.Fp memory y) = F.root(rhs);
        if (!exists) {
            return (false, point);
        }
        // Extract y-selection flag from encoded point
        bool sign = (uint8(_encoded[0]) & 0x20) != 0;
        if (F.large(y) != sign) {
            y = F.negate(y);
        }
        if (F.large(y) != sign) {
            return (false, point);
        }
        // Return valid G1 point
        return (true, [x.hi, x.lo, y.hi, y.lo]);
    }

    /// @notice Decodes a point from the G2 subgroup
    /// @param _encoded A compressed G2 point
    /// @return valid Whether the result is a valid point in the G2 subgroup
    /// @return point The uncompressed G2 point
    function decodeG2(bytes calldata _encoded) internal view returns (bool valid, uint256[8] memory point) {
        // Validate encoded input
        if (!_header(_encoded, 96)) {
            return (false, point);
        }
        // Extract both G2 x-coordinates
        F.Fp2 memory x = F.Fp2(_coordinate(_encoded, 48, false), _coordinate(_encoded, 0, true));
        // Ensure points are cononical
        if (!F.canonical(x.real) || !F.canonical(x.imag)) {
            return (false, point);
        }
        // Ensure points are non-zero
        if (F.isZero(x.real) && F.isZero(x.imag)) {
            return (false, point);
        }
        // Find y
        F.Fp2 memory rhs = F.add2(F.multiply2(F.square2(x), x), F.Fp2(F.Fp(0, 4), F.Fp(0, 4)));
        (bool exists, F.Fp2 memory y) = F.root2(rhs);
        if (!exists) {
            return (false, point);
        }
        // Extract y-selection flag from encoded point
        bool sign = (uint8(_encoded[0]) & 0x20) != 0;
        if (F.large2(y) != sign) {
            y = F.negate2(y);
        }
        if (F.large2(y) != sign){
            return (false, point);
        }
        // Return valid G2 point
        return (true, [x.real.hi, x.real.lo, x.imag.hi, x.imag.lo, y.real.hi, y.real.lo, y.imag.hi, y.imag.lo]);
    }

    /// @dev Checks if the encoded point is the correct length, compressed and not infinity
    function _header(bytes calldata encoded, uint256 size) private pure returns (bool) {
        return encoded.length == size && (uint8(encoded[0]) & 0xc0) == 0x80;
    }

    /// @dev Extracts a coordinate from a compressed point
    function _coordinate(bytes calldata encoded, uint256 offset, bool clearFlags) private pure returns (F.Fp memory) {
        uint256 hi;
        uint256 lo;
        // Header has already established the exact total input size
        assembly {
            hi := shr(128, calldataload(add(encoded.offset, offset)))
            lo := calldataload(add(add(encoded.offset, offset), 16))
        }
        if (clearFlags) {
            hi &= (uint256(1) << 125) - 1;
        }
        return F.Fp(hi, lo);
    }
}
