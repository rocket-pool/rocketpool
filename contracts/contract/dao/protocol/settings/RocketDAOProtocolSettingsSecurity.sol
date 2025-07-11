// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";
import {RocketDAOProtocolSettingsSecurityInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsSecurityInterface.sol";

/// @notice Protocol parameters relating to the security council
contract RocketDAOProtocolSettingsSecurity is RocketDAOProtocolSettings, RocketDAOProtocolSettingsSecurityInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "security") {
        version = 2;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            // Set defaults
            _setSettingUint("members.quorum", 0.5 ether);        // Member quorum threshold that must be met for proposals to pass (51%)
            _setSettingUint("members.leave.time", 4 weeks);      // How long a member must give notice for before manually leaving the security council
            _setSettingUint("proposal.vote.time", 2 weeks);      // How long a proposal can be voted on
            _setSettingUint("proposal.execute.time", 4 weeks);   // How long a proposal can be executed after its voting period is finished
            _setSettingUint("proposal.action.time", 4 weeks);    // Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires
            _setSettingUint("upgradeveto.quorum", 0.33 ether);   // RPIP-60: Member quorum threshold to veto a protocol upgrade (33%)
            _setSettingUint("upgrade.delay", 7 days);            // RPIP-60: Amount of time after an upgrade proposal passes that the security has to veto it
            // Default permissions for security council
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "deposit", "deposit.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "deposit", "deposit.assign.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "minipool", "minipool.submit.withdrawable.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "minipool", "minipool.bond.reduction.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.submit.balances.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.submit.prices.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.registration.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.smoothing.pool.registration.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.deposit.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "node", "node.vacant.minipools.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "auction", "auction.lot.create.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "auction", "auction.lot.bidding.enabled")), true);
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.node.commission.share.security.council.adder")), true);
            // Set deploy flag
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @dev Overrides inherited setting method with extra sanity checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(abi.encodePacked(_settingPath));
            if(settingKey == keccak256(abi.encodePacked("members.quorum"))) {
                // >= 51% & < 75% (RPIP-33)
                require(_value >= 0.51 ether && _value <= 0.75 ether, "Quorum setting must be >= 51% & <= 75%");
            } else if(settingKey == keccak256(abi.encodePacked("members.leave.time"))) {
                // < 14 days (RPIP-33)
                require(_value < 14 days, "Value must be < 14 days");
            } else if(settingKey == keccak256(abi.encodePacked("proposal.vote.time"))) {
                // >= 1 day (RPIP-33)
                require(_value >= 1 days, "Value must be >= 1 day");
            } else if(settingKey == keccak256(abi.encodePacked("proposal.execute.time"))) {
                // >= 1 day (RPIP-33)
                require(_value >= 1 days, "Value must be >= 1 day");
            } else if(settingKey == keccak256(abi.encodePacked("proposal.action.time"))) {
                // >= 1 day (RPIP-33)
                require(_value >= 1 days, "Value must be >= 1 day");
            }
        }
        // Update setting now
        _setSettingUint(_settingPath, _value);
    }

    /// @dev Sets a namespaced uint value skipping any guardrails
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice The member proposal quorum threshold for this DAO
    function getQuorum() override external view returns (uint256) {
        return getSettingUint("members.quorum");
    }

    /// @notice How long a member must give notice before leaving
    function getLeaveTime() override external view returns (uint256) {
        return getSettingUint("members.leave.time");
    }

    /// @notice How long a proposal can be voted on
    function getVoteTime() override external view returns (uint256) {
        return getSettingUint("proposal.vote.time");
    }

    /// @notice How long a proposal can be executed after its voting period is finished
    function getExecuteTime() override external view returns (uint256) {
        return getSettingUint("proposal.execute.time");
    }

    /// @notice Certain proposals require a secondary action to be run after the proposal is successful (joining, leaving etc). This is how long until that action expires
    function getActionTime() override external view returns (uint256) {
        return getSettingUint("proposal.action.time");
    }

    /// @notice The quorum required by the security council to veto an upgrade
    function getUpgradeVetoQuorum() override external view returns (uint256) {
        return getSettingUint("upgradeveto.quorum");
    }

    /// @notice The amount of time that must be waited after an upgrade before executing
    function getUpgradeDelay() override external view returns (uint256) {
        return getSettingUint("upgrade.delay");
    }
}
