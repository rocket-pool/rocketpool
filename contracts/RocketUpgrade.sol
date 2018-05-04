pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./RocketStorage.sol";
import "./interface/ERC20.sol";


/// @title Upgrades for Rocket Pool network contracts
/// @author David Rugendyke
contract RocketUpgrade is RocketBase {


    /*** Contracts **************/

    ERC20 tokenContract = ERC20(0);                             // The address of an ERC20 token contract


     /*** Events ****************/

    event ContractUpgraded (
        address indexed _oldContractAddress,                    // Address of the contract being upgraded
        address indexed _newContractAddress,                    // Address of the new contract
        uint256 created                                         // Creation timestamp
    );

    event ContractAdded (
        address indexed _contractAddress,                       // Address of the contract added
        uint256 created                                         // Creation timestamp
    );


    /*** Constructor ***********/    

    /// @dev RocketUpgrade constructor
    function RocketUpgrade(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }

    /**** Contract Upgrade Methods ***********/

    /// @param _name The name of an existing contract in the network
    /// @param _upgradedContractAddress The new contracts address that will replace the current one
    /// @param _forceEther Force the upgrade even if this contract has ether in it
     /// @param _forceTokens Force the upgrade even if this contract has known tokens in it
    // TODO: Write unit tests to verify
    function upgradeContract(string _name, address _upgradedContractAddress, bool _forceEther, bool _forceTokens) onlyOwner external {
        // Get the current contracts address
        address oldContractAddress = rocketStorage.getAddress(keccak256("contract.name", _name));
        // Check it exists
        require(oldContractAddress != 0x0);
        // Check it is not the contract's current address
        require(oldContractAddress != _upgradedContractAddress);
        // Firstly check the contract being upgraded does not have a balance, if it does, it needs to transfer it to the upgraded contract through a local upgrade method first
        // Ether can be forcefully sent to any contract though (even if it doesn't have a payable method), so to prevent contracts that need upgrading and for some reason have a balance, use the force method to upgrade them
        if (!_forceEther) {
            require(oldContractAddress.balance == 0);
        }
        // Check for any known tokens assigned to this contract
        if (!_forceTokens) {
            // Check for RPL
            tokenContract = ERC20(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolToken")));
            require(tokenContract.balanceOf(oldContractAddress) == 0);
            // Check for RPD
            tokenContract = ERC20(rocketStorage.getAddress(keccak256("contract.name", "rocketDepositToken")));
            require(tokenContract.balanceOf(oldContractAddress) == 0);
        }
        // Replace the address for the name lookup - contract addresses can be looked up by their name or verified by a reverse address lookup
        rocketStorage.setAddress(keccak256("contract.name", _name), _upgradedContractAddress);
        // Add the new contract address for a direct verification using the address (used in RocketStorage to verify its a legit contract using only the msg.sender)
        rocketStorage.setAddress(keccak256("contract.address", _upgradedContractAddress), _upgradedContractAddress);
        // Remove the old contract address verification
        rocketStorage.deleteAddress(keccak256("contract.address", oldContractAddress));
        // Log it
        ContractUpgraded(oldContractAddress, _upgradedContractAddress, now);
    }

    /// @param _name The name of the new contract
    /// @param _contractAddress The address of the new contract
    function addContract(string _name, address _contractAddress) onlyOwner external {
        // Check the contract address
        require(_contractAddress != 0x0);
        // Check the name is not already in use
        address existingContractName = rocketStorage.getAddress(keccak256("contract.name", _name));
        require(existingContractName == 0x0);
        // Check the address is not already in use
        address existingContractAddress = rocketStorage.getAddress(keccak256("contract.address", _contractAddress));
        require(existingContractAddress == 0x0);
        // Set contract name and address in storage
        rocketStorage.setAddress(keccak256("contract.name", _name), _contractAddress);
        rocketStorage.setAddress(keccak256("contract.address", _contractAddress), _contractAddress);
        // Log it
        ContractAdded(_contractAddress, now);
    }

}
