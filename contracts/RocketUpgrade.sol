pragma solidity 0.5.8;


import "./RocketBase.sol";
import "./interface/token/ERC20.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";


/// @title Upgrades for Rocket Pool network contracts
/// @author David Rugendyke
contract RocketUpgrade is RocketBase {


    /*** Contracts **************/

    ERC20 tokenContract = ERC20(0);                             // The address of an ERC20 token contract
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0); // Address storage utility


    /*** Events ****************/

    event ContractUpgraded (
        address indexed _oldContractAddress,                    // Address of the contract being upgraded
        address indexed _newContractAddress,                    // Address of the new contract
        bytes32 indexed _name,                                  // Name of the contract
        uint256 created                                         // Creation timestamp
    );

    event ContractAdded (
        address indexed _contractAddress,                       // Address of the contract added
        bytes32 indexed _name,                                  // Name of the contract
        uint256 created                                         // Creation timestamp
    );

    event ABIUpgraded (
        bytes32 indexed _name,                                  // Name of the contract ABI
        uint256 created                                         // Creation timestamp
    );

    event ABIAdded (
        bytes32 indexed _name,                                  // Name of the contract ABI
        uint256 created                                         // Creation timestamp
    );


    /*** Modifiers ***********/


    /// @dev Must be called by an upgrade approver
    modifier onlyUpgradeApprover() {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("upgrade.approvers")), msg.sender) != -1, "Sender must be an upgrade approver");
        _;
    }


    /*** Constructor ***********/    

    /// @dev RocketUpgrade constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Contract Upgrade Methods ***********/

    // For adding & upgrading Rocket Pool network contracts, e.g. RocketPool, RocketNode


    /// @param _name The name of an existing contract in the network
    /// @param _upgradedContractAddress The new contracts address that will replace the current one
    /// @param _upgradedContractAbi The zlib compressed, base64 encoded ABI of the new contract
    /// @param _forceEther Force the upgrade even if this contract has ether in it
    /// @param _forceTokens Force the upgrade even if this contract has known tokens in it
    function upgradeContract(string memory _name, address _upgradedContractAddress, string memory _upgradedContractAbi, bool _forceEther, bool _forceTokens) onlyUpgradeApprover public {
        // Get the current contracts address
        address oldContractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _name)));
        // Check it exists
        require(oldContractAddress != address(0x0), "Contract name does not exist");
        // Check it is not the contract's current address
        require(oldContractAddress != _upgradedContractAddress, "Upgraded contract address must not be existing contract address");
        // Check contract is not a token contract
        require(oldContractAddress != getContractAddress("rocketPoolToken"), "Cannot upgrade token contracts");
        require(oldContractAddress != getContractAddress("rocketETHToken"), "Cannot upgrade token contracts");
        // Firstly check the contract being upgraded does not have a balance, if it does, it needs to transfer it to the upgraded contract through a local upgrade method first
        // Ether can be forcefully sent to any contract though (even if it doesn't have a payable method), so to prevent contracts that need upgrading and for some reason have a balance, use the force method to upgrade them
        if (!_forceEther) {
            require(oldContractAddress.balance == 0, "Existing contract has an ether balance");
        }
        // Check for any known tokens assigned to this contract
        if (!_forceTokens) {
            // Check for RPL
            tokenContract = ERC20(getContractAddress("rocketPoolToken"));
            require(tokenContract.balanceOf(oldContractAddress) == 0, "Existing contract has an RPL balance");
            // Check for rETH
            tokenContract = ERC20(getContractAddress("rocketETHToken"));
            require(tokenContract.balanceOf(oldContractAddress) == 0, "Existing contract has an rETH balance");
        }
        // Check for initialisation of this upgrade
        address upgradeInitialisedBy = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.upgrade.init", _name, _upgradedContractAddress, _upgradedContractAbi, _forceEther, _forceTokens)));
        require(upgradeInitialisedBy != msg.sender, "Upgrade was initialised by this approver");
        // Complete upgrade if already initialised
        if (upgradeInitialisedBy != address(0x0)) {
            rocketStorage.deleteAddress(keccak256(abi.encodePacked("contract.upgrade.init", _name, _upgradedContractAddress, _upgradedContractAbi, _forceEther, _forceTokens)));
            // Replace the address for the name lookup - contract addresses can be looked up by their name or verified by a reverse address lookup
            rocketStorage.setAddress(keccak256(abi.encodePacked("contract.name", _name)), _upgradedContractAddress);
            // Replace the stored contract ABI
            rocketStorage.setString(keccak256(abi.encodePacked("contract.abi", _name)), _upgradedContractAbi);
            // Add the new contract address for a direct verification using the address (used in RocketStorage to verify its a legit contract using only the msg.sender)
            rocketStorage.setAddress(keccak256(abi.encodePacked("contract.address", _upgradedContractAddress)), _upgradedContractAddress);
            // Remove the old contract address verification
            rocketStorage.deleteAddress(keccak256(abi.encodePacked("contract.address", oldContractAddress)));
            // Log it
            emit ContractUpgraded(oldContractAddress, _upgradedContractAddress, keccak256(abi.encodePacked(_name)), now);
        }
        // Initialise upgrade if not initialised yet
        else {
            rocketStorage.setAddress(keccak256(abi.encodePacked("contract.upgrade.init", _name, _upgradedContractAddress, _upgradedContractAbi, _forceEther, _forceTokens)), msg.sender);
        }
    }


    /// @param _name The name of the new contract
    /// @param _contractAddress The address of the new contract
    /// @param _contractAbi The zlib compressed, base64 encoded ABI of the new contract
    function addContract(string memory _name, address _contractAddress, string memory _contractAbi) onlyUpgradeApprover public {
        // Check the contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        // Check the name is not already in use
        address existingContractName = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _name)));
        require(existingContractName == address(0x0), "Contract name is already in use");
        // Check the address is not already in use
        address existingContractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractAddress)));
        require(existingContractAddress == address(0x0), "Contract address is already in use");
        // Check the name is not for an existing ABI
        string memory existingAbi = rocketStorage.getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) == keccak256(abi.encodePacked("")), "ABI with name already exists");
        // Set contract name, address and ABI in storage
        rocketStorage.setAddress(keccak256(abi.encodePacked("contract.name", _name)), _contractAddress);
        rocketStorage.setAddress(keccak256(abi.encodePacked("contract.address", _contractAddress)), _contractAddress);
        rocketStorage.setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Log it
        emit ContractAdded(_contractAddress, keccak256(abi.encodePacked(_name)), now);
    }


    /**** ABI Upgrade Methods ****************/

    // For adding & upgrading dynamically created contract ABIs, e.g. RocketMinipool, RocketNodeContract, RocketGroupContract


    /// @param _name The name of an existing contract ABI in the network
    /// @param _upgradedContractAbi The zlib compressed, base64 encoded ABI
    function upgradeABI(string memory _name, string memory _upgradedContractAbi) onlyUpgradeApprover public {
        // Check the name is not for an existing contract
        address existingContractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _name)));
        require(existingContractAddress == address(0x0), "Contract with name already exists");
        // Check ABI exists
        string memory existingAbi = rocketStorage.getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) != keccak256(abi.encodePacked("")), "ABI name does not exist");
        // Check for initialisation of this upgrade
        address upgradeInitialisedBy = rocketStorage.getAddress(keccak256(abi.encodePacked("abi.upgrade.init", _name, _upgradedContractAbi)));
        require(upgradeInitialisedBy != msg.sender, "Upgrade was initialised by this approver");
        // Complete upgrade if already initialised
        if (upgradeInitialisedBy != address(0x0)) {
            rocketStorage.deleteAddress(keccak256(abi.encodePacked("abi.upgrade.init", _name, _upgradedContractAbi)));
            // Replace the stored contract ABI
            rocketStorage.setString(keccak256(abi.encodePacked("contract.abi", _name)), _upgradedContractAbi);
            // Log it
            emit ABIUpgraded(keccak256(abi.encodePacked(_name)), now);
        }
        // Initialise upgrade if not initialised yet
        else {
            rocketStorage.setAddress(keccak256(abi.encodePacked("abi.upgrade.init", _name, _upgradedContractAbi)), msg.sender);
        }
    }


    /// @param _name The name of the new contract ABI
    /// @param _contractAbi The zlib compressed, base64 encoded ABI
    function addABI(string memory _name, string memory _contractAbi) onlyUpgradeApprover public {
        // Check the name is not for an existing contract
        address existingContractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _name)));
        require(existingContractAddress == address(0x0), "Contract with name already exists");
        // Check the name is not already in use
        string memory existingAbi = rocketStorage.getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) == keccak256(abi.encodePacked("")), "ABI with name already exists");
        // Set contract ABI in storage
        rocketStorage.setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Log it
        emit ABIAdded(keccak256(abi.encodePacked(_name)), now);
    }


}
