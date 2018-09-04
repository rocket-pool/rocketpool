pragma solidity 0.4.24;


// Our deposit and withdrawals interface
contract RocketDepositSettingsInterface {
    // Getters
    function getDepositAllowed() public view returns (bool);
    function getDepositMin() public view returns (uint256);
    function getDepositMax() public view returns (uint256);
    function getWithdrawalAllowed() public view returns (bool);
    function getWithdrawalMin() public view returns (uint256);
    function getWithdrawalMax() public view returns (uint256);
}
