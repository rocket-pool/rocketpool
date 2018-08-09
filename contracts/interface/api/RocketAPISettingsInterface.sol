pragma solidity 0.4.24;


contract RocketAPISettingsInterface {
    /// @dev Are deposits currently allowed?                                                 
    function getDepositAllowed() public view returns (bool);
    /// @dev Min required deposit in Wei 
    function getDepositMin() public view returns (uint256);
    /// @dev Max allowed deposit in Wei 
    function getDepositMax() public view returns (uint256);
    /// @dev Are withdrawals allowed?                                            
    function getWithdrawalAllowed() public view returns (bool);
    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function getWithdrawalMin() public view returns (uint256);
    /// @dev Max allowed to be withdrawn in Wei
    function getWithdrawalMax() public view returns (uint256);
}