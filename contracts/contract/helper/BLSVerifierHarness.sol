// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {BLSDepositVerifier} from "../util/BLSDepositVerifier.sol";
import {BLSPointDecoder} from "../util/bls/BLSPointDecoder.sol";
import {BLSSubgroupChecks} from "../util/bls/BLSSubgroupChecks.sol";
import {BLSField as F} from "../util/bls/BLSField.sol";

/// @dev Test-only access to decoder coordinates and execution-failure boundaries
contract BLSVerifierHarness is BLSDepositVerifier {
    constructor() BLSDepositVerifier(0x00000000) {}

    function decodeG1(bytes calldata compressed) external view returns (bool, uint256[4] memory) {
        (bool valid, uint256[4] memory point) = BLSPointDecoder.decodeG1(compressed);
        return (valid && BLSSubgroupChecks.g1(point), point);
    }

    function decodeG2(bytes calldata compressed) external view returns (bool, uint256[8] memory) {
        (bool valid, uint256[8] memory point) = BLSPointDecoder.decodeG2(compressed);
        return (valid && BLSSubgroupChecks.g2(point), point);
    }

    function subgroupAt(address target, bytes memory point, bytes memory control, uint256 budget) external view returns (bool) {
        return BLSSubgroupChecks._check(target, point, control, budget);
    }

    function generators() external pure returns (uint256[4] memory, uint256[8] memory) {
        return (BLSSubgroupChecks._generatorG1(), BLSSubgroupChecks._generatorG2());
    }

    function pairing(bytes memory input) external view returns (bool) {
        return _pairing(input);
    }

    function callWithGas(address target, bytes calldata data, uint256 budget) external view returns (bool, bytes memory) {
        return target.staticcall{gas: budget}(data);
    }

    function sqrtFp2(uint128 c1Hi, uint256 c1Lo, uint128 c0Hi, uint256 c0Lo) external view returns (bool, uint256[4] memory) {
        (bool valid, F.Fp2 memory y) = F.root2(F.Fp2(F.Fp(c0Hi, c0Lo), F.Fp(c1Hi, c1Lo)));
        return (valid, [y.real.hi, y.real.lo, y.imag.hi, y.imag.lo]);
    }
}
