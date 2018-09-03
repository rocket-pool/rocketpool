pragma solidity 0.4.24;


// Our smart node interface
contract RocketNodeSettingsInterface {
    // Getters
    function getNewAllowed() public view returns (bool);
    function getEtherMin() public view returns (uint256);
    function getCheckinGas() public view returns (uint256);
    function getInactiveAutomatic() public view returns (bool);
    function getInactiveDuration() public view returns (uint256);
    function getDepositAllowed() public view returns (bool);
}
