pragma solidity 0.4.24;


// Our smart node interface
contract RocketNodeSettingsInterface {
    // Getters
    function getSmartNodeEtherMin() public view returns (uint256);
    function getSmartNodeCheckinGas() public view returns (uint256);
    function getSmartNodeSetInactiveAutomatic() public view returns (bool);
    function getSmartNodeSetInactiveDuration() public view returns (uint256);
}
