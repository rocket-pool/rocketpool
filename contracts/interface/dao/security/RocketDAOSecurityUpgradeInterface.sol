// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";

interface RocketDAOSecurityUpgradeInterface {
    function proposeVeto(string memory _proposalMessage, uint256 _upgradeProposalId) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;

    function proposalVeto(uint256 _upgradeProposalId) external;
}
