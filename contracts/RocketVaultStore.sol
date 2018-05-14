pragma solidity 0.4.23;


import "./RocketBase.sol";
import "./interface/ERC20.sol";


/// @title Ether/Tokens held in the RocketVault are stored here
/// @author Jake Pospischil

contract RocketVaultStore is RocketBase {


    /*** Contracts *************/

    ERC20 tokenContract = ERC20(0);         // The address of an ERC20 token contract


    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketVault contract
    modifier onlyLatestRocketVault() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketVault")));
        _;
    }


    /*** Constructor ***********/

    /// @dev RocketVaultStore constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Methods **************/


    /// @dev Deposit ether
    function depositEther() payable external onlyLatestRocketVault returns (bool) {
        return true;
    }


    /// @dev Withdraw ether to address
    /// @param _withdrawalAddress The address to withdraw ether to
    /// @param _amount The amount of ether to withdraw
    function withdrawEther(address _withdrawalAddress, uint256 _amount) external onlyLatestRocketVault returns (bool) {
        _withdrawalAddress.transfer(_amount);
        return true;
    }


    /// @dev Withdraw tokens to address
    /// @param _tokenAddress The address of the ERC20 token contract
    /// @param _withdrawalAddress The address to withdraw tokens to
    /// @param _amount The amount of tokens to withdraw
    function withdrawTokens(address _tokenAddress, address _withdrawalAddress, uint256 _amount) external onlyLatestRocketVault returns (bool) {
        tokenContract = ERC20(_tokenAddress);
        return tokenContract.transfer(_withdrawalAddress, _amount);
    }


}
