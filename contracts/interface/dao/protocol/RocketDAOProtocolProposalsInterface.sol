pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";
import "./RocketDAOProtocolVerifierInterface.sol";

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolProposalsInterface {
    function propose(string memory _proposalMessage, bytes memory _payload, uint32 _blockNumber, Types.Node[] calldata _treeNodes) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;
    function destroy(uint256 _proposalID) external;

    function proposalSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _data) external;
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) external;
    function proposalSettingRewardsClaimer(string memory _contractName, uint256 _perc) external;
    function proposalSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
}
