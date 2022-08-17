pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/rewards/RocketSmoothingPoolInterface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/*
Receives priority fees and MEV via fee_recipient

NOTE: This contract intentionally does not use RocketVault to store ETH because there is no way to account for ETH being
added to this contract via fee_recipient. This also means if this contract is upgraded, the ETH must be manually
transferred from this contract to the upgraded one.
*/

contract RocketSmoothingPool is RocketBase, RocketSmoothingPoolInterface {

    // Libs
    using SafeMath for uint256;

    // Events
    event EtherWithdrawn(string indexed by, address indexed to, uint256 amount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    // Allow receiving ETH
    receive() payable external {}

    // Withdraws ETH to given address
    // Only accepts calls from Rocket Pool network contracts
    function withdrawEther(address _to, uint256 _amount) override external onlyLatestNetworkContract {
        // Valid amount?
        require(_amount > 0, "No valid amount of ETH given to withdraw");
        // Get contract name
        string memory contractName = getContractName(msg.sender);
        // Send the ETH
        (bool result,) = _to.call{value: _amount}("");
        require(result, "Failed to withdraw ETH");
        // Emit ether withdrawn event
        emit EtherWithdrawn(contractName, _to, _amount, block.timestamp);
    }
}
