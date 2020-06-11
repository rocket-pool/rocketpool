pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../lib/SafeMath.sol";

// Handles network validator withdrawals

contract RocketNetworkWithdrawal is RocketBase, RocketNetworkWithdrawalInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the validator withdrawal credentials
    function getWithdrawalCredentials() override public view returns (bytes memory) {
        // TODO: implement
        return hex"0000000000000000000000000000000000000000000000000000000000000000";
    }

    // Process a validator withdrawal from the beacon chain
    // Only accepts calls from trusted (withdrawer) nodes (TBA)
    function withdraw(bytes calldata _validatorPubkey) external onlyTrustedNode(msg.sender) {
        // 1. Calculate the share of the validator balance for node operators vs users
        // 2. Transfer the node operators' share to the nETH contract
        // 3. Transfer the users' share:
        //    - to the rETH contract if ETH utilization rate is >= minimum
        //    - to the deposit pool if ETH utilization rate is < minimum
    }

}
