pragma solidity 0.5.0;


// Our smart node interface
contract RocketNodeSettingsInterface {
    // Getters
    function getNewAllowed() public view returns (bool);
    function getEtherMin() public view returns (uint256);
    function getCheckinGasPrice() public view returns (uint256);
    function getDepositEtherGasLimit() public view returns (uint256);
    function getDepositRPLGasLimit() public view returns (uint256);
    function getInactiveAutomatic() public view returns (bool);
    function getInactiveDuration() public view returns (uint256);
    function getMaxInactiveNodeChecks() public view returns (uint256);
    function getDepositAllowed() public view returns (bool);
    function getDepositReservationTime() public view returns (uint256);
    function getWithdrawalAllowed() public view returns (bool);
}
