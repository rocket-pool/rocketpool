pragma solidity 0.5.0;


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


    /*** Modifiers **************/


    // Sender must be RocketDeposit or RocketDepositQueue
    modifier onlyDepositOrDepositQueue() {
        require(
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDeposit"))) ||
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositQueue"))),
            "Sender is not RocketDeposit or RocketDepositQueue"
        );
        _;
    }


    /**** Methods **************/


    /// @dev Deposit ether
    function depositEther() payable external onlyLatestContract("rocketDeposit", msg.sender) returns (bool) {
        return true;
    }


    /// @dev Withdraw ether to address
    /// @param _withdrawalAddress The address to withdraw ether to
    /// @param _amount The amount of ether to withdraw
    function withdrawEther(address _withdrawalAddress, uint256 _amount) external onlyDepositOrDepositQueue() returns (bool) {
        (bool success, bytes memory data) = _withdrawalAddress.call.value(_amount)("");
        require(success, "Withdrawal amount could not be transferred to withdrawal address");
        return true;
    }


}
