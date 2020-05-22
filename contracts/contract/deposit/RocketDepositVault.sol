pragma solidity 0.6.8;

// Ether and RPX (node fees) from staker deposits are stored here until assigned to minipools

contract RocketDepositVault {

    // Accepts Ether deposits
    // Only accepts calls from the RocketDeposit contract
    function depositEther() {}

    // Withdraws an amount of Ether to a specified address
    // Only accepts calls from the RocketDeposit contract
    function withdrawEther(address _withdrawalAddress, uint256 _amount) {}

}
