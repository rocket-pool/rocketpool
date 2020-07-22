pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketBase.sol";
import "../interface/RocketVaultInterface.sol";
import "../interface/RocketVaultWithdrawerInterface.sol";
import "../lib/SafeMath.sol";

// ETH and rETH are stored here to prevent contract upgrades from affecting balances
// The RocketVault contract must not be upgraded

contract RocketVault is RocketBase, RocketVaultInterface {

    // Libs
    using SafeMath for uint;

    // Network contract balances
    mapping(string => uint256) balances;

    // Events
    event EtherDeposited(bytes32 indexed by, uint256 amount, uint256 time);
    event EtherWithdrawn(bytes32 indexed by, uint256 amount, uint256 time);

	// Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get a contract's ETH balance by address
    function balanceOf(address _contractAddress) override public view returns (uint256) {
        return balances[getContractName(_contractAddress)];
    }

    // Accept an ETH deposit from a network contract
    // Only accepts calls from Rocket Pool network contracts
    function depositEther() override external payable onlyLatestNetworkContract {
        // Get contract name
        string memory contractName = getContractName(msg.sender);
        // Update contract balance
        balances[contractName] = balances[contractName].add(msg.value);
        // Emit ether deposited event
        emit EtherDeposited(keccak256(abi.encodePacked(contractName)), msg.value, now);
    }

    // Withdraw an amount of ETH to a network contract
    // Only accepts calls from Rocket Pool network contracts
    function withdrawEther(uint256 _amount) override external onlyLatestNetworkContract {
        // Get contract name
        string memory contractName = getContractName(msg.sender);
        // Check and update contract balance
        require(balances[contractName] >= _amount, "Insufficient contract ETH balance");
        balances[contractName] = balances[contractName].sub(_amount);
        // Withdraw
        RocketVaultWithdrawerInterface withdrawer = RocketVaultWithdrawerInterface(msg.sender);
        withdrawer.receiveVaultWithdrawal{value: _amount}();
        // Emit ether withdrawn event
        emit EtherWithdrawn(keccak256(abi.encodePacked(contractName)), _amount, now);
    }

}
