// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

/// @dev Set of utilities for working with SSZ serialisation and merkleisation
library SSZ {
    struct Path {
        uint256 _data;
    }

    /// @dev Decodes a Path to a full gindex
    function toIndex(Path memory _path) internal pure returns (uint256) {
        uint256 pathLength = uint8(_path._data);
        uint256 anchor = uint256(1) << pathLength;
        return (_path._data >> 8) | anchor;
    }

    /// @dev Extracts the length component from a Path
    function length(Path memory _path) internal pure returns (uint8) {
        return uint8(_path._data);
    }

    /// @dev Constructs a Path from a given gindex and length
    function from(uint248 _gindex, uint8 _length) internal pure returns (Path memory) {
        return Path((uint256(_gindex) << 8) | uint256(_length));
    }

    /// @dev Constructs a Path into a vector field
    function intoVector(uint256 _index, uint8 _log2Length) internal pure returns (Path memory) {
        return Path((uint256(_index) << 8) | uint256(_log2Length + 1));
    }

    /// @dev Constructs a Path into a list field
    function intoList(uint256 index, uint8 log2Len) internal pure returns (Path memory) {
        return Path((uint256(index) << 8) | uint256(log2Len));
    }

    /// @dev Concatenates two Paths
    function concat(Path memory _left, Path memory _right) internal pure returns (Path memory) {
        uint8 lenA = uint8(_left._data);
        uint8 lenB = uint8(_right._data);
        unchecked {
            // Prevent overflow of length into path
            require(uint256(lenA) + uint256(lenB) <= type(uint8).max, "Path too long");
            _left._data = (_left._data - lenA) << lenB;
            _left._data += _right._data + lenA;
        }
        return _left;
    }

    /// @dev Interprets a big-ending uint256 as a little-endian encodes bytes32 value
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

    /// @dev Performs SSZ merkleisation of a pubkey value
    function merkleisePubkey(bytes memory pubkey) internal view returns (bytes32 ret) {
        require(pubkey.length == 48, "Invalid pubkey length");
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

    /// @dev Concatenates two bytes32 values and returns a SHA256 of the result
    function efficientSha256(bytes32 _left, bytes32 _right) internal view returns (bytes32 ret) {
        assembly {
            mstore(0x00, _left)
            mstore(0x20, _right)

            let result := staticcall(84, 0x02, 0x00, 0x40, 0x00, 0x20)
            if iszero(result) {
                revert(0,0)
            }

            ret := mload(0x00)
        }
    }

    /// @dev Restores a merkle root from a merkle proof
    /// @param _leaf The SSZ merkleised leaf node
    /// @param _gindex The gindex of the proof
    /// @param _witnesses The proof witnesses
    function restoreMerkleRoot(bytes32 _leaf, uint256 _gindex, bytes32[] memory _witnesses) internal view returns (bytes32) {
        // Check for correct number of witnesses
        require(2 ** (_witnesses.length + 1) > _gindex, "Invalid witness length");
        bytes32 value = _leaf;
        uint256 i = 0;
        while (_gindex != 1) {
            if (_gindex % 2 == 1) {
                value = efficientSha256(_witnesses[i], value);
            } else {
                value = efficientSha256(value, _witnesses[i]);
            }
            _gindex /= 2;
            unchecked {
                i++;
            }
        }
        return value;
    }
}


