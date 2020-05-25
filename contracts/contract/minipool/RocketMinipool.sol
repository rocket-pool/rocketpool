pragma solidity 0.6.8;

// An individual minipool in the Rocket Pool network

contract RocketMinipool {

    // Assign deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositVault contract
    function assignDeposit() public payable {}

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the node owner address
    function stakeMinipool(bytes memory _validatorPubkey, bytes memory _validatorSignature, bytes32 _depositDataRoot) public {}

    // Mark the minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool() public {}

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(uint256 _withdrawalBalance) public {}

    // Withdraw rewards from the minipool and close it
    // Only accepts calls from the node owner address
    function closeMinipool() public {}

}
