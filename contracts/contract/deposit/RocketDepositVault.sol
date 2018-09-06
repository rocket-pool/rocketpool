pragma solidity 0.4.24;


import "../../RocketBase.sol";


/// @title Ether held in deposits is stored here
/// @author Jake Pospischil

contract RocketDepositVault is RocketBase {


    /*** Constructor ***********/


    /// @dev RocketVaultStore constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Methods **************/


    /// @dev Deposit ether
    function depositEther() payable external onlyLatestContract("rocketDeposit", msg.sender) returns (bool) {
        return true;
    }


    /// @dev Withdraw ether to address
    /// @param _withdrawalAddress The address to withdraw ether to
    /// @param _amount The amount of ether to withdraw
    function withdrawEther(address _withdrawalAddress, uint256 _amount) external onlyLatestContract("rocketDeposit", msg.sender) returns (bool) {
        _withdrawalAddress.transfer(_amount);
        return true;
    }


}
