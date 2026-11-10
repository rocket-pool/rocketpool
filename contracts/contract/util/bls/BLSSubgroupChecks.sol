// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @notice Subgroup checks for points already decoded with canonical on-curve coordinates.
/// @dev Relies on EIP-2537's fixed gas cost for a one-term MSM. A rejected input
/// is invalid only if a known-valid control succeeds with the SAME gas allowance.
library BLSSubgroupChecks {
    // BLS precompile addresses
    address constant internal BLS12_G1MSM = address(0x0c);
    address constant internal BLS12_G2MSM = address(0x0e);

    // Precompile gas budgets
    uint256 constant internal g1GasBudget = 12_000;
    uint256 constant internal g2GasBudget = 22_500;

    /// @notice Returns true if the given point is in the G1 sub group
    function g1(uint256[4] memory point) internal view returns (bool) {
        return _check(BLS12_G1MSM, abi.encode(point), abi.encode(_generatorG1()), g1GasBudget);
    }

    /// @notice Returns true if the given point is in the G2 sub group
    function g2(uint256[8] memory point) internal view returns (bool) {
        return _check(BLS12_G2MSM, abi.encode(point), abi.encode(_generatorG2()), g2GasBudget);
    }

    function _check(address target, bytes memory point, bytes memory control, uint256 budget) internal view returns (bool) {
        (bool success, bytes memory result) = _call(target, abi.encodePacked(point, uint256(1)), budget);
        if (success) {
            // Scalar-one multiplication must return the original point
            // Missing or malformed output is an execution error, not evidence of invalid data
            if (result.length != point.length || keccak256(result) != keccak256(point)) {
                revert("Precompile failed");
            }
            return true;
        }
        // Invalid result
        if (result.length != 0) {
            revert("Precompile failed");
        }
        // An unavailable or repriced precompile must not cause a false allegation
        // Use a nonzero generator so this exercises a normal one-term MSM
        (success, result) = _call(target, abi.encodePacked(control, uint256(1)), budget);
        if (!success || result.length != control.length || keccak256(result) != keccak256(control)) {
            revert("Precompile failed");
        }
        return false;
    }

    function _call(address target, bytes memory input, uint256 budget) private view returns (bool, bytes memory) {
        // Check after allocating the input. Margin covers CALL overhead (even a
        // cold target) and EIP-150, preventing silent reduction of the stipend.
        if (gasleft() < budget * 64 / 63 + 10_000) {
            revert("Insufficient gas");
        }
        return target.staticcall{gas: budget}(input);
    }

    /// @dev Returns G1 generator for BLS12-381
    function _generatorG1() internal pure returns (uint256[4] memory) {
        return [
                    uint256(0x17f1d3a73197d7942695638c4fa9ac0f),
                    0xc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb,
                    0x0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4,
                    0xfcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1
            ];
    }

    /// @dev Returns G2 generator for BLS12-381
    function _generatorG2() internal pure returns (uint256[8] memory) {
        return [
                    uint256(0x024aa2b2f08f0a91260805272dc51051),
                    0xc6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8,
                    0x0000000000000000000000000000000013e02b6052719f607dacd3a088274f65,
                    0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e,
                    0x000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a,
                    0xadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801,
                    0x000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99,
                    0xcb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be
            ];
    }
}
