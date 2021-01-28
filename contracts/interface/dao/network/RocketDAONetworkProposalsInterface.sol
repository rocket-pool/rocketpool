pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONetworkProposalsInterface {
    function proposalSettingUint(string memory _settingPath, uint256 _value) external;
    function proposalSettingRewardsClaimer(string memory _contractName, uint256 _perc) external;
}
