pragma solidity 0.4.24;


// Our eternal storage interface
contract RocketAPISettingsInterface {
    // Getters
    function getDepositAllowed() public view returns (bool);
    function getDepositMin() public view returns (uint256);
    function getDepositMax() public view returns (uint256);
    function getWithdrawalAllowed() public view returns (bool);
    function getWithdrawalMin() public view returns (uint256);
    function getWithdrawalMax() public view returns (uint256);
    // Setters
    function setDepositAllowed(bool _enabled) public;
    function setDepositMin(uint256 _weiAmount) public;
    function setDepositMax(uint256 _weiAmount) public;
    function setWithdrawalAllowed(bool _enabled) public;
    function setWithdrawalMin(uint256 _weiAmount) public;
    function setWithdrawalMax(uint256 _weiAmount) public;
}
