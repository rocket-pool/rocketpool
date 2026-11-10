// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @notice BLS12-381 arithmetic over Fp and Fp[i]/(i^2 + 1).
/// @dev Operands must be canonical (< p). Values use a high limb plus a 256-bit
/// low limb. Multiplication constructs the full integer product, then uses
/// EIP-198 with exponent one for reduction.
library BLSField {
    uint256 internal constant P_HI = 0x1a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 internal constant P_LO = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;

    struct Fp { uint256 hi; uint256 lo; }
    struct Fp2 { Fp real; Fp imag; }

    function canonical(Fp memory a) internal pure returns (bool) {
        return a.hi < P_HI || (a.hi == P_HI && a.lo < P_LO);
    }

    function equal(Fp memory a, Fp memory b) internal pure returns (bool) {
        return a.hi == b.hi && a.lo == b.lo;
    }

    function isZero(Fp memory a) internal pure returns (bool) {
        return a.hi == 0 && a.lo == 0;
    }

    function greater(Fp memory a, Fp memory b) internal pure returns (bool) {
        return a.hi > b.hi || (a.hi == b.hi && a.lo > b.lo);
    }

    function add(Fp memory a, Fp memory b) internal pure returns (Fp memory r) {
        unchecked {
            r.lo = a.lo + b.lo;
            r.hi = a.hi + b.hi + (r.lo < a.lo ? 1 : 0);
        }
        // a+b < 2p, so one subtraction is sufficient
        if (!canonical(r)) r = subtractInteger(r, Fp(P_HI, P_LO));
    }

    function subtract(Fp memory a, Fp memory b) internal pure returns (Fp memory) {
        if (greater(b, a)) {
            return subtractInteger(Fp(P_HI, P_LO), subtractInteger(b, a));
        }
        return subtractInteger(a, b);
    }

    function negate(Fp memory a) internal pure returns (Fp memory) {
        return isZero(a) ? Fp(0, 0) : subtractInteger(Fp(P_HI, P_LO), a);
    }

    function half(Fp memory a) internal pure returns (Fp memory r) {
        r = Fp(a.hi, a.lo);
        if ((a.lo & 1) != 0) {
            unchecked {
                r.lo = a.lo + P_LO;
                r.hi = a.hi + P_HI + (r.lo < a.lo ? 1 : 0);
            }
        }
        r.lo = (r.lo >> 1) | ((r.hi & 1) << 255);
        r.hi >>= 1;
    }

    function multiply(Fp memory a, Fp memory b) internal view returns (Fp memory) {
        (uint256 top, uint256 middle, uint256 bottom) = product(a, b);
        return modExp(abi.encodePacked(top, middle, bottom), hex"01");
    }

    function square(Fp memory a) internal view returns (Fp memory) {
        return multiply(a, a);
    }

    /// @dev Full 768-bit product, ordered most-significant word first. Canonical
    /// operands have high limbs < 2^125. Consequently the top accumulation is
    /// < 2^250 + 2^126 + 2, and cannot overflow a 256-bit word.
    function product(Fp memory a, Fp memory b) internal pure returns (uint256 top, uint256 middle, uint256 bottom) {
        (uint256 carry, uint256 low) = wordProduct(a.lo, b.lo);
        bottom = low;
        middle = carry;
        top = a.hi * b.hi;
        (carry, low) = wordProduct(a.hi, b.lo);
        unchecked {
            uint256 previous = middle;
            middle += low;
            top += carry + (middle < previous ? 1 : 0);
        }
        (carry, low) = wordProduct(a.lo, b.hi);
        unchecked {
            uint256 previous = middle;
            middle += low;
            top += carry + (middle < previous ? 1 : 0);
        }
    }

    /// @dev Let B=2^256 and ab=hB+l. Then ab mod (B-1)=(h+l) mod (B-1).
    /// Recover h by subtracting l and correcting the modular wrap.
    function wordProduct(uint256 a, uint256 b) private pure returns (uint256 hi, uint256 lo) {
        assembly {
            lo := mul(a, b)
            let residue := mulmod(a, b, not(0))
            hi := sub(sub(residue, lo), lt(residue, lo))
        }
    }

    function inverse(Fp memory a) internal view returns (Fp memory) {
        if (isZero(a)) {
            revert("Inverse of zero");
        }
        return modExp(pack(a), abi.encodePacked(bytes16(uint128(P_HI)), bytes32(P_LO - 2)));
    }

    function root(Fp memory a) internal view returns (bool exists, Fp memory r) {
        // p = 3 mod 4. A candidate is a^((p+1)/4); squaring decides existence.
        uint256 exponentLo = ((P_LO + 1) >> 2) | (P_HI << 254);
        r = modExp(pack(a), abi.encodePacked(bytes16(uint128(P_HI >> 2)), bytes32(exponentLo)));
        exists = equal(square(r), a);
    }

    function large(Fp memory a) internal pure returns (bool) {
        return greater(a, negate(a));
    }

    function pack(Fp memory a) private pure returns (bytes memory) {
        return abi.encodePacked(bytes16(uint128(a.hi)), bytes32(a.lo));
    }

    function modExp(bytes memory base, bytes memory exponent) private view returns (Fp memory r) {
        bytes memory input = abi.encodePacked(
            uint256(base.length), uint256(exponent.length), uint256(48), base, exponent,
            bytes16(uint128(P_HI)), bytes32(P_LO)
        );
        (bool success, bytes memory output) = address(0x05).staticcall(input);
        if (!success || output.length != 48) {
            revert("ModExp failed");
        }
        uint256 hi;
        uint256 lo;
        assembly {
            hi := shr(128, mload(add(output, 32)))
            lo := mload(add(output, 48))
        }
        r = Fp(hi, lo);
        if (!canonical(r)) {
            revert("ModExp failed");
        }
    }

    /// @dev Integer subtraction, requiring a >= b. No modular reduction.
    function subtractInteger(Fp memory a, Fp memory b) private pure returns (Fp memory r) {
        unchecked {
            r.lo = a.lo - b.lo;
            r.hi = a.hi - b.hi - (a.lo < b.lo ? 1 : 0);
        }
    }

    function equal2(Fp2 memory a, Fp2 memory b) internal pure returns (bool) {
        return equal(a.real, b.real) && equal(a.imag, b.imag);
    }

    function add2(Fp2 memory a, Fp2 memory b) internal pure returns (Fp2 memory) {
        return Fp2(add(a.real, b.real), add(a.imag, b.imag));
    }

    function negate2(Fp2 memory a) internal pure returns (Fp2 memory) {
        return Fp2(negate(a.real), negate(a.imag));
    }

    function multiply2(Fp2 memory a, Fp2 memory b) internal view returns (Fp2 memory) {
        // (a+bi)(c+di) = (ac-bd) + ((a+b)(c+d)-ac-bd)i.
        Fp memory ac = multiply(a.real, b.real);
        Fp memory bd = multiply(a.imag, b.imag);
        Fp memory sumProduct = multiply(add(a.real, a.imag), add(b.real, b.imag));
        return Fp2(subtract(ac, bd), subtract(subtract(sumProduct, ac), bd));
    }

    function square2(Fp2 memory a) internal view returns (Fp2 memory) {
        // (a+bi)^2 = (a+b)(a-b) + 2ab i.
        Fp memory ab = multiply(a.real, a.imag);
        return Fp2(multiply(add(a.real, a.imag), subtract(a.real, a.imag)), add(ab, ab));
    }

    function large2(Fp2 memory a) internal pure returns (bool) {
        return large(isZero(a.imag) ? a.real : a.imag);
    }

    /// @dev For z=a+bi and root=c+di: c^2=(a +/- sqrt(a^2+b^2))/2,
    /// d=b/(2c). Try both choices deterministically and verify by squaring.
    /// The b=0 cases are handled separately to avoid division by zero.
    function root2(Fp2 memory z) internal view returns (bool exists, Fp2 memory r) {
        r = Fp2(Fp(0, 0), Fp(0, 0));
        if (isZero(z.imag)) {
            (bool realRoot, Fp memory value) = root(z.real);
            if (realRoot) {
                r.real = value;
            } else {
                (exists, value) = root(negate(z.real));
                if (!exists) return (false, r);
                r.imag = value;
            }
            return (equal2(square2(r), z), r);
        }
        (bool normExists, Fp memory normRoot) = root(add(square(z.real), square(z.imag)));
        if (!normExists) {
            return (false, r);
        }
        for (uint256 choice = 0; choice < 2; ++choice) {
            (bool realExists, Fp memory realPart) = root(half(add(z.real, normRoot)));
            if (realExists && !isZero(realPart)) {
                Fp memory imagPart = multiply(z.imag, inverse(add(realPart, realPart)));
                r = Fp2(realPart, imagPart);
                if (equal2(square2(r), z)) {
                    return (true, r);
                }
            }
            normRoot = negate(normRoot);
        }
        return (false, r);
    }
}
