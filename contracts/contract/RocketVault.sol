pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "./util/SafeERC20.sol";
import "../interface/RocketVaultInterface.sol";
import "../interface/RocketVaultWithdrawerInterface.sol";
import "../interface/util/IERC20Burnable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// ETH and rETH are stored here to prevent contract upgrades from affecting balances
// The RocketVault contract must not be upgraded

contract RocketVault is RocketBase, RocketVaultInterface {

    // Libs
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    // Network contract balances
    mapping(string => uint256) etherBalances;
    mapping(bytes32 => uint256) tokenBalances;

    // Events
    event EtherDeposited(string indexed by, uint256 amount, uint256 time);
    event EtherWithdrawn(string indexed by, uint256 amount, uint256 time);
    event TokenDeposited(bytes32 indexed by, address indexed tokenAddress, uint256 amount, uint256 time);
    event TokenWithdrawn(bytes32 indexed by, address indexed tokenAddress, uint256 amount, uint256 time);
    event TokenBurned(bytes32 indexed by, address indexed tokenAddress, uint256 amount, uint256 time);
    event TokenTransfer(bytes32 indexed by, bytes32 indexed to, address indexed tokenAddress, uint256 amount, uint256 time);

	// Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get a contract's ETH balance by address
    function balanceOf(string memory _networkContractName) override external view returns (uint256) {
        // Return balance
        return etherBalances[_networkContractName];
    }

    // Get the balance of a token held by a network contract
    function balanceOfToken(string memory _networkContractName, IERC20 _tokenAddress) override external view returns (uint256) {
        // Return balance
        return tokenBalances[keccak256(abi.encodePacked(_networkContractName, _tokenAddress))];
    }

    // Accept an ETH deposit from a network contract
    // Only accepts calls from Rocket Pool network contracts
    function depositEther() override external payable onlyLatestNetworkContract {
        // Valid amount?
        require(msg.value > 0, "No valid amount of ETH given to deposit");
        // Get contract key
        string memory contractName = getContractName(msg.sender);
        // Update contract balance
        etherBalances[contractName] = etherBalances[contractName].add(msg.value);
        // Emit ether deposited event
        emit EtherDeposited(contractName, msg.value, block.timestamp);
    }

    // Withdraw an amount of ETH to a network contract
    // Only accepts calls from Rocket Pool network contracts
    function withdrawEther(uint256 _amount) override external onlyLatestNetworkContract {
        // Valid amount?
        require(_amount > 0, "No valid amount of ETH given to withdraw");
        // Get contract key
        string memory contractName = getContractName(msg.sender);
        // Check and update contract balance
        require(etherBalances[contractName] >= _amount, "Insufficient contract ETH balance");
        etherBalances[contractName] = etherBalances[contractName].sub(_amount);
        // Withdraw
        RocketVaultWithdrawerInterface withdrawer = RocketVaultWithdrawerInterface(msg.sender);
        withdrawer.receiveVaultWithdrawalETH{value: _amount}();
        // Emit ether withdrawn event
        emit EtherWithdrawn(contractName, _amount, block.timestamp);
    }

    // Accept an token deposit and assign its balance to a network contract (saves a large amount of gas this way through not needing a double token transfer via a network contract first)
    function depositToken(string memory _networkContractName, IERC20 _tokenContract, uint256 _amount) override external {
         // Valid amount?
        require(_amount > 0, "No valid amount of tokens given to deposit");
        // Make sure the network contract is valid (will throw if not)
        require(getContractAddress(_networkContractName) != address(0x0), "Not a valid network contract");
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(_networkContractName, address(_tokenContract)));
        // Send the tokens to this contract now
        require(_tokenContract.transferFrom(msg.sender, address(this), _amount), "Token transfer was not successful");
        // Update contract balance
        tokenBalances[contractKey] = tokenBalances[contractKey].add(_amount);
        // Emit token transfer
        emit TokenDeposited(contractKey, address(_tokenContract), _amount, block.timestamp);
    }

    // Withdraw an amount of a ERC20 token to an address
    // Only accepts calls from Rocket Pool network contracts
    function withdrawToken(address _withdrawalAddress, IERC20 _tokenAddress, uint256 _amount) override external onlyLatestNetworkContract {
        // Valid amount?
        require(_amount > 0, "No valid amount of tokens given to withdraw");
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender), _tokenAddress));
        // Update balances
        tokenBalances[contractKey] = tokenBalances[contractKey].sub(_amount);
        // Get the token ERC20 instance
        IERC20 tokenContract = IERC20(_tokenAddress);
        // Withdraw to the desired address
        require(tokenContract.transfer(_withdrawalAddress, _amount), "Rocket Vault token withdrawal unsuccessful");
        // Emit token withdrawn event
        emit TokenWithdrawn(contractKey, address(_tokenAddress), _amount, block.timestamp);
    }

    // Transfer token from one contract to another
    // Only accepts calls from Rocket Pool network contracts
    function transferToken(string memory _networkContractName, IERC20 _tokenAddress, uint256 _amount) override external onlyLatestNetworkContract {
        // Valid amount?
        require(_amount > 0, "No valid amount of tokens given to transfer");
        // Make sure the network contract is valid (will throw if not)
        require(getContractAddress(_networkContractName) != address(0x0), "Not a valid network contract");
        // Get contract keys
        bytes32 contractKeyFrom = keccak256(abi.encodePacked(getContractName(msg.sender), _tokenAddress));
        bytes32 contractKeyTo = keccak256(abi.encodePacked(_networkContractName, _tokenAddress));
        // Update balances
        tokenBalances[contractKeyFrom] = tokenBalances[contractKeyFrom].sub(_amount);
        tokenBalances[contractKeyTo] = tokenBalances[contractKeyTo].add(_amount);
        // Emit token withdrawn event
        emit TokenTransfer(contractKeyFrom, contractKeyTo, address(_tokenAddress), _amount, block.timestamp);
    }

    // Burns an amount of a token that implements a burn(uint256) method
    // Only accepts calls from Rocket Pool network contracts
    function burnToken(IERC20Burnable _tokenAddress, uint256 _amount) override external onlyLatestNetworkContract {
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender), _tokenAddress));
        // Update balances
        tokenBalances[contractKey] = tokenBalances[contractKey].sub(_amount);
        // Get the token ERC20 instance
        IERC20Burnable tokenContract = IERC20Burnable(_tokenAddress);
        // Burn the tokens
        tokenContract.burn(_amount);
        // Emit token burn event
        emit TokenBurned(contractKey, address(_tokenAddress), _amount, block.timestamp);
    }
}
