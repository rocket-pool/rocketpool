pragma solidity 0.4.24;

/// @title Rocket Pool deposit vault
contract RocketDepositVaultInterface {
    function depositEther() payable external returns (bool);
    function withdrawEther(address _withdrawalAddress, uint256 _amount) external returns (bool);
}
