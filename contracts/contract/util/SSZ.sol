// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

/// @dev Set of utilities for working with SSZ serialisation and merkleisation
library SSZ {
    struct Path {
        uint256 _data;
    }

    function toIndex(Path memory path) internal pure returns (uint256) {
        uint256 length = uint8(path._data);
        uint256 anchor = uint256(1) << length;
        return (path._data >> 8) | anchor;
    }

    function length(Path memory path) internal pure returns (uint8) {
        return uint8(path._data);
    }

    function from(uint248 gindex, uint8 len) internal pure returns (Path memory) {
        return Path((uint256(gindex) << 8) | uint256(len));
    }

    function intoVector(uint256 index, uint8 log2Len) internal pure returns (Path memory) {
        return Path((uint256(index) << 8) | uint256(log2Len + 1));
    }

    function concat(Path memory a, Path memory b) internal pure returns (Path memory) {
        uint8 lenA = uint8(a._data);
        uint8 lenB = uint8(b._data);
        unchecked {
        // Prevent overflow of length into path
            require(uint256(lenA) + uint256(lenB) <= type(uint8).max);
            a._data = (a._data - lenA) << lenB;
            a._data += b._data + lenA;
        }
        return a;
    }

    function toLittleEndian(uint256 v) internal pure returns (bytes32) {
        v = ((v & 0xFF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00) >> 8)
            | ((v & 0x00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF) << 8);
        v = ((v & 0xFFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000) >> 16)
            | ((v & 0x0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF) << 16);
        v = ((v & 0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000) >> 32)
            | ((v & 0x00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF) << 32);
        v = ((v & 0xFFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF0000000000000000) >> 64)
            | ((v & 0x0000000000000000FFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF) << 64);
        v = (v >> 128) | (v << 128);
        return bytes32(v);
    }

    function merkleisePubkey(bytes memory pubkey) internal view returns (bytes32 ret) {
        require(pubkey.length == 48);
        assembly {
            mstore(0x00, mload(add(0x20, pubkey)))
            let right := and(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000, mload(add(0x40, pubkey)))
            mstore(0x20, right)

            let result := staticcall(84, 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0,0)
            }

            ret := mload(0x00)
        }
    }

    function efficientSha256(bytes32 a, bytes32 b) internal view returns (bytes32 ret) {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)

            let result := staticcall(84, 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0,0)
            }

            ret := mload(0x00)
        }
    }

    function restoreMerkleRoot(bytes32 leaf, uint256 index, bytes32[] memory proof) internal view returns (bytes32) {
        // Check for correct number of witnesses
        require(2 ** (proof.length + 1) > index);
        bytes32 value = leaf;
        uint256 i = 0;
        while (index != 1) {
            if (index % 2 == 1) {
                value = efficientSha256(proof[i], value);
            } else {
                value = efficientSha256(value, proof[i]);
            }
            index /= 2;
            unchecked {
                i++;
            }
        }
        return value;
    }
}


