pragma solidity >0.5.0 <0.9.0;

interface BlockRootsInterface {
    function getBlockRoot(uint64 _slot) external view returns (bytes32);
}
