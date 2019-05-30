pragma solidity 0.5.8;


// Our smart node interface
contract RocketNodeSettingsInterface {
    // Getters
    function getNewAllowed() public view returns (bool);
    function getEtherMin() public view returns (uint256);
    function getInactiveAutomatic() public view returns (bool);
    function getInactiveDuration() public view returns (uint256);
    function getMaxInactiveNodeChecks() public view returns (uint256);
    function getFeePerc() public view returns (uint256);
    function getMaxFeePerc() public view returns (uint256);
    function getFeeVoteCycleDuration() public view returns (uint256);
    function getFeeVoteCyclePercChange() public view returns (uint256);
    function getDepositAllowed() public view returns (bool);
    function getDepositReservationTime() public view returns (uint256);
    function getWithdrawalAllowed() public view returns (bool);
}
