pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "../interface/RocketVaultInterface.sol";
import "../interface/RocketVaultWithdrawerInterface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ETH and rETH are stored here to prevent contract upgrades from affecting balances
// The RocketVault contract must not be upgraded

contract RocketVault is RocketBase, RocketVaultInterface {

    // Libs
    using SafeMath for uint;

    // Network contract balances
    mapping(bytes32 => uint256) etherBalances;
    mapping(bytes32 => uint256) tokenBalances;

    // Events
    event EtherDeposited(bytes32 indexed by, uint256 amount, uint256 time);
    event EtherWithdrawn(bytes32 indexed by, uint256 amount, uint256 time);
    event TokenDeposited(bytes32 indexed by, address indexed tokenAddress, uint256 amount, uint256 time);
    event TokenWithdrawn(bytes32 indexed by, address indexed tokenAddress, uint256 amount, uint256 time);

	// Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get a contract's ETH balance by address
    function balanceOf(address _contractAddress) override public view returns (uint256) {
        return etherBalances[keccak256(abi.encodePacked(getContractName(_contractAddress)))];
    }

    // Accept an ETH deposit from a network contract
    // Only accepts calls from Rocket Pool network contracts
    function depositEther() override external payable onlyLatestNetworkContract {
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender)));
        // Update contract balance
        etherBalances[contractKey] = etherBalances[contractKey].add(msg.value);
        // Emit ether deposited event
        emit EtherDeposited(contractKey, msg.value, now);
    }

    // Withdraw an amount of ETH to a network contract
    // Only accepts calls from Rocket Pool network contracts
    function withdrawEther(uint256 _amount) override external onlyLatestNetworkContract {
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender)));
        // Check and update contract balance
        require(etherBalances[contractKey] >= _amount, "Insufficient contract ETH balance");
        etherBalances[contractKey] = etherBalances[contractKey].sub(_amount);
        // Withdraw
        RocketVaultWithdrawerInterface withdrawer = RocketVaultWithdrawerInterface(msg.sender);
        withdrawer.receiveVaultWithdrawalETH{value: _amount}();
        // Emit ether withdrawn event
        emit EtherWithdrawn(contractKey, _amount, now);
    }

    // Accept an token deposit from a network contract
    // Only accepts calls from Rocket Pool network contracts
    function depositToken(address _tokenAddress, uint256 _amount) override external onlyLatestNetworkContract {
         // Valid amount?
        require(_amount > 0, "No valid amount of tokens given to deposit");
        // Get the token ERC20 instance
        IERC20 tokenContract = IERC20(_tokenAddress);
        // Check they can cover the amount
        require(tokenContract.balanceOf(address(msg.sender)) >= _amount, "Not enough tokens to cover transfer");
        // Check they have allowed this contract to send their tokens
        uint256 allowance = tokenContract.allowance(msg.sender, address(this));
        // Enough to cover it?
        require(allowance >= _amount, "Not enough allowance given for transfer of tokens");
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender), _tokenAddress));
        // Send the tokens to this contract now and mint new ones for them
        if (tokenContract.transferFrom(msg.sender, address(this), _amount)) {
            // Update contract balance
            tokenBalances[contractKey] = tokenBalances[contractKey].add(_amount);
            // Emit token transfer
            emit TokenDeposited(contractKey, _tokenAddress, _amount, now);
        }else{
            revert("Token transfer was not successful");
        }
    }

    // Withdraw an amount of a ERC20 token to a network contract
    // Only accepts calls from Rocket Pool network contracts
    function withdrawToken(address _tokenAddress, uint256 _amount) override external onlyLatestNetworkContract {
        // Get contract key
        bytes32 contractKey = keccak256(abi.encodePacked(getContractName(msg.sender), _tokenAddress));
        // Get the token ERC20 instance
        IERC20 tokenContract = IERC20(_tokenAddress);
        // Verify this contract has that amount of tokens at a minimum
        require(tokenContract.balanceOf(address(this)) >= _amount, "Insufficient contract token balance");
        // Withdraw and let calling contract know
        if(tokenContract.transfer(msg.sender, _amount)) {
            // Update balances
            tokenBalances[contractKey] = tokenBalances[contractKey].sub(_amount);
            // Emit token withdrawn event
            emit TokenWithdrawn(contractKey, _tokenAddress, _amount, now);
        }else{
            revert("Rocket Vault token withdrawal unsuccessful");
        }

    }

}
