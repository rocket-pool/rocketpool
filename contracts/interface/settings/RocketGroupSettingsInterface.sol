pragma solidity 0.5.8;


// Our group interface
contract RocketGroupSettingsInterface {
    // Getters
    function getDefaultFee() public view returns (uint256);
    function getMaxFee() public view returns (uint256);
    function getNewAllowed() public view returns (bool);
    function getNewFee() public view returns (uint256);
    function getNewFeeAddress() public view returns (address payable);
}
