pragma solidity 0.4.23;


contract RocketFactoryInterface {
    /// @dev Create a new RocketPoolMini contract, deploy to the etherverse and return the address to the caller
    /// @dev Note that the validation and logic for creation should be done in the calling contract
    /// @param _miniPoolStakingDuration The staking duration for the mini pool
    function createRocketPoolMini(uint256 _miniPoolStakingDuration) public returns(address);
}