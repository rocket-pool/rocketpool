pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../../RocketBase.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsInterface.sol";

// Settings in RP which the DAO will have full control over
// This settings contract enables storage using setting paths with namespaces, rather than explicit set methods
abstract contract RocketDAONodeTrustedSettings is RocketBase, RocketDAONodeTrustedSettingsInterface {


    // The namespace for a particular group of settings
    bytes32 settingNameSpace;


    // Only allow updating from the DAO proposals contract
    modifier onlyDAONodeTrustedProposal() {
        // If this contract has been initialised, only allow access from the proposals contract
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) require(getContractAddress("rocketDAONodeTrustedProposals") == msg.sender, "Only DAO Node Trusted Proposals contract can update a setting");
        _;
    }


    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, string memory _settingNameSpace) RocketBase(_rocketStorageAddress) {
        // Apply the setting namespace
        settingNameSpace = keccak256(abi.encodePacked("dao.trustednodes.setting.", _settingNameSpace));
    }


    /*** Uints  ****************/

    // A general method to return any setting given the setting path is correct, only accepts uints
    function getSettingUint(string memory _settingPath) public view override returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
    } 

    // Update a Uint setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingUint(string memory _settingPath, uint256 _value) virtual public override onlyDAONodeTrustedProposal {
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    } 
   

    /*** Bools  ****************/

    // A general method to return any setting given the setting path is correct, only accepts bools
    function getSettingBool(string memory _settingPath) public view override returns (bool) {
        return getBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
    } 

    // Update a setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingBool(string memory _settingPath, bool _value) virtual public override onlyDAONodeTrustedProposal {
        // Update setting now
        setBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

}
