pragma solidity 0.6.8;

// ETH and rETH (fees) from user deposits are stored here

contract RocketDepositVault {

    // Accept an ETH deposit
    // Only accepts calls from the RocketDeposit contract
    function depositEther() public payable {}

    // Withdraw an amount of ETH to a specified address
    // Only accepts calls from the RocketDeposit contract
    function withdrawEther(address _withdrawalAddress, uint256 _amount) public {}

    // Withdraw an amount of rETH to a specified address
    // Only accepts calls from the RocketNodeRewards contract
    function withdrawReth(address _withdrawalAddress, uint256 _amount) public {}

}
