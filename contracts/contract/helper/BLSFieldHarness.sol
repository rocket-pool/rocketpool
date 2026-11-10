// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {BLSField as F} from "../util/bls/BLSField.sol";

/// @dev Test-only direct access to arithmetic and its canonical-input precondition
contract BLSFieldHarness {
    function arithmetic(F.Fp calldata a, F.Fp calldata b) external view returns (
        uint256[3] memory fullProduct, F.Fp memory reduced, F.Fp memory sum,
        F.Fp memory difference, F.Fp memory half, F.Fp memory negative
    ) {
        require(F.canonical(a) && F.canonical(b), "non-canonical input");
        (fullProduct[0], fullProduct[1], fullProduct[2]) = F.product(a, b);
        return (fullProduct, F.multiply(a, b), F.add(a, b), F.subtract(a, b), F.half(a), F.negate(a));
    }

    function root(F.Fp calldata a) external view returns (bool, F.Fp memory) {
        require(F.canonical(a), "non-canonical input");
        return F.root(a);
    }

    function inverse(F.Fp calldata a) external view returns (F.Fp memory) {
        require(F.canonical(a), "non-canonical input");
        return F.inverse(a);
    }

    function extension(F.Fp2 calldata a, F.Fp2 calldata b) external view returns (F.Fp2 memory, F.Fp2 memory) {
        require(F.canonical(a.real) && F.canonical(a.imag) && F.canonical(b.real) && F.canonical(b.imag), "non-canonical input");
        return (F.multiply2(a, b), F.square2(a));
    }

    function root2(F.Fp2 calldata a) external view returns (bool, F.Fp2 memory) {
        require(F.canonical(a.real) && F.canonical(a.imag), "non-canonical input");
        return F.root2(a);
    }
}
