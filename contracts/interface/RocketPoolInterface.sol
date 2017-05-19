pragma solidity ^0.4.2;

contract RocketPoolInterface {
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    modifier poolsAllowedToBeClosed() {_;}
    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {_;}
    /// @dev MiniPools can request the main contract to be removed
    function removePool() poolsAllowedToBeClosed onlyMiniPool returns(bool);
}