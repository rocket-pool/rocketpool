// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketDAONodeTrustedUpgradeInterface {
    enum UpgradeProposalState {
        Pending,        // Upgrade proposal is in the delay period
        Succeeded,      // Upgrade proposal can be executed immediately
        Vetoed,         // Upgrade was vetoed by the security council
        Executed        // Upgrade was executed
    }

    function upgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) external;
    function veto(uint256 _upgradeProposalID) external;
    function execute(uint256 _upgradeProposalID) external;
    function bootstrapUpgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) external;

    function getTotal() external view returns (uint256);
    function getState(uint256 _upgradeProposalID) external view returns (UpgradeProposalState);
    function getEnd(uint256 _upgradeProposalID) external view returns (uint256);
    function getExecuted(uint256 _upgradeProposalID) external view returns (bool);
    function getVetoed(uint256 _upgradeProposalID) external view returns (bool);
    function getType(uint256 _upgradeProposalID) external view returns (bytes32);
    function getName(uint256 _upgradeProposalID) external view returns (string memory);
    function getUpgradeAddress(uint256 _upgradeProposalID) external view returns (address);
    function getUpgradeABI(uint256 _upgradeProposalID) external view returns (string memory);
}
