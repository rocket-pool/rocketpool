// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";

/// @notice v1.4 Saturn 1 dissolve parameter hotfix upgrade contract
contract RocketUpgradeOneDotFourDissolveHotfix is RocketBase {
    // Whether the upgrade has been performed or not
    bool internal executed = false;

    // The deployer address
    address internal deployer;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        deployer = msg.sender;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");
        executed = true;

        // Bypass guardrails and set "megapool.time.before.dissolve" to 1 year
        bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "megapool"));
        setUint(keccak256(abi.encodePacked(settingNameSpace, "megapool.time.before.dissolve")), 365 days);
    }
}
