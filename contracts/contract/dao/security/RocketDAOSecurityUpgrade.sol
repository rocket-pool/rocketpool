// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../../RocketBase.sol";
import {RocketStorageInterface} from "../../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../../interface/RocketVaultInterface.sol";
import {RocketDAOProposalInterface} from "../../../interface/dao/RocketDAOProposalInterface.sol";
import {RocketDAOProtocolInterface} from "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import {RocketDAOProtocolSettingsSecurityInterface} from "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsSecurityInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketDAOSecurityActionsInterface} from "../../../interface/dao/security/RocketDAOSecurityActionsInterface.sol";
import {RocketDAOSecurityInterface} from "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import {RocketDAOSecurityUpgradeInterface} from "../../../interface/dao/security/RocketDAOSecurityUpgradeInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../../interface/network/RocketNetworkRevenuesInterface.sol";
import {IERC20Burnable} from "../../../interface/util/IERC20Burnable.sol";
import {RocketDAONodeTrustedUpgradeInterface} from "../../../interface/dao/node/RocketDAONodeTrustedUpgradeInterface.sol";

/// @notice Proposal contract for the security council upgrade veto powers
contract RocketDAOSecurityUpgrade is RocketBase, RocketDAOSecurityUpgradeInterface {

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant internal daoNameSpace = "dao.security.";

    /// @dev Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAOProtocol") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    /// @dev Only allow security councils to vote
    modifier onlySecurityMember() {
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender))), "Sender is not a security council member");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Creates a new upgrade veto proposal for this DAO
    /// @param _proposalMessage A short message explaining what this proposal does
    /// @param _upgradeProposalID ID of the upgrade proposal to propose a veto for
    function proposeVeto(string memory _proposalMessage, uint256 _upgradeProposalID) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityUpgrade", address(this)) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        // Construct veto payload
        bytes memory payload = abi.encodeWithSelector(this.proposalVeto.selector, _upgradeProposalID);
        // Create the proposal
        return daoProposal.add(msg.sender, "rocketDAOSecurityUpgrade", _proposalMessage, block.timestamp + 1, rocketDAOProtocolSettingsSecurity.getVoteTime(), rocketDAOProtocolSettingsSecurity.getExecuteTime(), rocketDAOProtocolSettingsSecurity.getUpgradeVetoQuorum(), payload);
    }

    /// @notice Vote on a proposal
    /// @param _proposalID The ID of the proposal to vote on
    /// @param _support Whether the caller votes in favour or against the proposal
    function vote(uint256 _proposalID, bool _support) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityUpgrade", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOSecurityInterface daoSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        // Did they join after this proposal was created? If so, they can't vote or it'll throw off the set proposalVotesRequired
        require(daoSecurity.getMemberJoinedTime(msg.sender) < daoProposal.getCreated(_proposalID), "Member cannot vote on proposal created before they became a member");
        // Vote now, one vote per security council member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }

    /// @notice Cancel a proposal
    /// @param _proposalID The ID of the proposal to cancel
    function cancel(uint256 _proposalID) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityUpgrade", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }

    /// @notice Execute a successful proposal
    /// @param _proposalID The ID of the proposal to execute
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAOSecurityUpgrade", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Execute now
        daoProposal.execute(_proposalID);
    }

    /// @notice Veto a protocol upgrade
    /// @param _upgradeProposalID The ID of the upgrade to veto
    function proposalVeto(uint256 _upgradeProposalID) override public onlyExecutingContracts {
        RocketDAONodeTrustedUpgradeInterface rocketDAONodeTrustedUpgrade = RocketDAONodeTrustedUpgradeInterface(getContractAddress("rocketDAONodeTrustedUpgrade"));
        rocketDAONodeTrustedUpgrade.veto(_upgradeProposalID);
    }
}
