pragma solidity 0.6.8;

// ETH and RPX (fees) from staker deposits are stored here

contract RocketDepositVault {

    // Accepts ETH deposits
    // Only accepts calls from the RocketDeposit contract
    function depositEther() payable {}

    // Withdraws an amount of ETH to a specified address
    // Only accepts calls from the RocketDeposit contract
    function withdrawEther(address _withdrawalAddress, uint256 _amount) {}

    // Withdraws an amount of RPX to a specified address
    // Only accepts calls from the RocketDeposit and RocketStaking contracts
    function withdrawRPX(address _withdrawalAddress, uint256 _amount) {}

}
