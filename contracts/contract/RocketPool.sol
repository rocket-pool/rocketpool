pragma solidity 0.6.8;

// Global network information and functions

contract RocketPool {

    // Get the current RP network total ETH balance
    function getTotalETHBalance() public returns (uint256) {}

    // Get the current RP network staking ETH balance
    function getStakingETHBalance() public returns (uint256) {}

    // Get the current RP network ETH utilization rate as a fraction of 1 ETH
    // Represents what % of the network's balance is actively earning rewards
    function getETHUtilizationRate() public returns (uint256) {
        // Staking ETH balance / total ETH balance
    }

    // Set the current RP network total ETH balance
    // Only accepts calls from the RocketDeposit & RocketETHToken contracts, or trusted (oracle) nodes
    function setTotalETHBalance(uint256 _balance) public {}

    // Set the current RP network staking ETH balance
    // Only accepts calls from trusted (oracle) nodes
    function setStakingETHBalance(uint256 _balance) public {}

}
