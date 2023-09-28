// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";

/// @notice Settings related to proposals in the protocol DAO
contract RocketDAOProtocolSettingsProposals is RocketDAOProtocolSettings, RocketDAOProtocolSettingsProposalsInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "proposals") {
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("proposal.vote.time", 2 weeks);                  // How long a proposal can be voted on
            setSettingUint("proposal.vote.delay.time", 1 weeks);            // How long before a proposal can be voted on after it is created
            setSettingUint("proposal.execute.time", 4 weeks);               // How long a proposal can be executed after its voting period is finished
            setSettingUint("proposal.bond", 100 ether);                     // The amount of RPL a proposer has to put up as a bond for creating a new proposal
            setSettingUint("proposal.challenge.bond", 10 ether);            // The amount of RPL a challenger has to put up as a bond for challenging a proposal
            setSettingUint("proposal.challenge.period", 30 minutes);        // The amount of time a proposer has to respond to a challenge before a proposal is defeated
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice How long a proposal can be voted on
    function getVoteTime() override external view returns (uint256) {
        return getSettingUint("proposal.vote.time");
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
