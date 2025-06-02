// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";

/// @notice Settings related to proposals in the protocol DAO
contract RocketDAOProtocolSettingsProposals is RocketDAOProtocolSettings, RocketDAOProtocolSettingsProposalsInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "proposals") {
        version = 2;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("proposal.vote.phase1.time", 1 weeks);           // How long a proposal can be voted on in phase 1
            setSettingUint("proposal.vote.phase2.time", 1 weeks);           // How long a proposal can be voted on in phase 2
            setSettingUint("proposal.vote.delay.time", 1 weeks);            // How long before a proposal can be voted on after it is created
            setSettingUint("proposal.execute.time", 4 weeks);               // How long a proposal can be executed after its voting period is finished
            setSettingUint("proposal.bond", 100 ether);                     // The amount of RPL a proposer has to put up as a bond for creating a new proposal
            setSettingUint("proposal.challenge.bond", 10 ether);            // The amount of RPL a challenger has to put up as a bond for challenging a proposal
            setSettingUint("proposal.challenge.period", 30 minutes);        // The amount of time a proposer has to respond to a challenge before a proposal is defeated
            setSettingUint("proposal.quorum", 0.51 ether);                  // The quorum required to pass a proposal
            setSettingUint("proposal.veto.quorum", 0.51 ether);             // The quorum required to veto a proposal
            setSettingUint("proposal.max.block.age", 1024);                 // The maximum age of a block a proposal can be raised at
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        bytes32 settingKey = keccak256(bytes(_settingPath));
        if(settingKey == keccak256(bytes("proposal.vote.phase1.time"))) {
            // Must be at least 1 day (RPIP-33)
            require(_value >= 1 days, "Value must be at least 1 day");
        } else if(settingKey == keccak256(bytes("proposal.vote.phase2.time"))) {
            // Must be at least 1 day (RPIP-33)
            require(_value >= 1 days, "Value must be at least 1 day");
        } else if(settingKey == keccak256(bytes("proposal.vote.delay.time"))) {
            // Must be at least 1 week (RPIP-33)
            require(_value >= 1 weeks, "Value must be at least 1 week");
        } else if(settingKey == keccak256(bytes("proposal.execute.time"))) {
            // Must be at least 1 week (RPIP-33)
            require(_value >= 1 weeks, "Value must be at least 1 week");
        } else if(settingKey == keccak256(bytes("proposal.bond"))) {
            // Must be higher than 20 RPL(RPIP-33)
            require(_value > 20 ether, "Value must be higher than 20 RPL");
        } else if(settingKey == keccak256(bytes("proposal.challenge.bond"))) {
            // Must be higher than 2 RPL(RPIP-33)
            require(_value > 2 ether, "Value must be higher than 2 RPL");
        } else if(settingKey == keccak256(bytes("proposal.challenge.period"))) {
            // Must be at least 30 minutes (RPIP-33)
            require(_value >= 30 minutes, "Value must be at least 30 minutes");
        } else if(settingKey == keccak256(bytes("proposal.quorum"))) {
            // Must be >= 15% & < 75% (RPIP-63)
            require(_value >= 0.15 ether && _value < 0.75 ether, "Value must be >= 15% & < 75%");
        } else if(settingKey == keccak256(bytes("proposal.veto.quorum"))) {
            // Must be >= 51% & < 75% (RPIP-33)
            require(_value >= 0.51 ether && _value < 0.75 ether, "Value must be >= 51% & < 75%");
        } else if(settingKey == keccak256(bytes("proposal.max.block.age"))) {
            // Must be > 128 blocks & < 7200 blocks (RPIP-33)
            require(_value > 128 && _value < 7200, "Value must be > 128 blocks & < 7200 blocks");
        } 
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice How long a proposal can be voted on in phase 1
    function getVotePhase1Time() override external view returns (uint256) {
        return getSettingUint("proposal.vote.phase1.time");
    }

    /// @notice How long a proposal can be voted on in phase 2
    function getVotePhase2Time() override external view returns (uint256) {
        return getSettingUint("proposal.vote.phase2.time");
    }

    /// @notice How long before a proposal can be voted on after it is created
    function getVoteDelayTime() override external view returns (uint256) {
        return getSettingUint("proposal.vote.delay.time");
    }

    /// @notice How long a proposal can be executed after its voting period is finished
    function getExecuteTime() override external view returns (uint256) {
        return getSettingUint("proposal.execute.time");
    }

    /// @notice The amount of RPL that is locked when raising a proposal
    function getProposalBond() override external view returns (uint256) {
        return getSettingUint("proposal.bond");
    }

    /// @notice The amount of RPL that is locked when challenging a proposal
    function getChallengeBond() override external view returns (uint256) {
        return getSettingUint("proposal.challenge.bond");
    }

    /// @notice How long (in seconds) a proposer has to respond to a challenge
    function getChallengePeriod() override external view returns (uint256) {
        return getSettingUint("proposal.challenge.period");
    }

    /// @notice The quorum required for a proposal to be successful (as a fraction of 1e18)
    function getProposalQuorum() override external view returns (uint256) {
        return getSettingUint("proposal.quorum");
    }

    /// @notice The quorum required for a proposal veto to be successful (as a fraction of 1e18)
    function getProposalVetoQuorum() override external view returns (uint256) {
        return getSettingUint("proposal.veto.quorum");
    }

    /// @notice The maximum time in the past (in blocks) a proposal can be submitted for
    function getProposalMaxBlockAge() override external view returns (uint256) {
        return getSettingUint("proposal.max.block.age");
    }
}
