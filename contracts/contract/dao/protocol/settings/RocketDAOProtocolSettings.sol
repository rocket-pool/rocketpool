// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInterface.sol";
import {RocketBase} from "../../../RocketBase.sol";

// Settings in RP which the DAO will have full control over
// This settings contract enables storage using setting paths with namespaces, rather than explicit set methods
abstract contract RocketDAOProtocolSettings is RocketBase, RocketDAOProtocolSettingsInterface {

    // The namespace for a particular group of settings
    bytes32 settingNameSpace;

    // Only allow updating from the DAO proposals contract
    modifier onlyDAOProtocolProposal() {
        // If this contract has been initialised, only allow access from the proposals contract
        if (getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) require(getContractAddress("rocketDAOProtocolProposals") == msg.sender, "Only DAO Protocol Proposals contract can update a setting");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, string memory _settingNameSpace) RocketBase(_rocketStorageAddress) {
        // Apply the setting namespace
        settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", _settingNameSpace));
    }

    /*** Uints  ****************/

    // A general method to return any setting given the setting path is correct, only accepts uints
    function getSettingUint(string memory _settingPath) public view override returns (uint256) {
        return getUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
    }

    // Update a Uint setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingUint(string memory _settingPath, uint256 _value) virtual public override onlyDAOProtocolProposal {
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /*** Bools  ****************/

    // A general method to return any setting given the setting path is correct, only accepts bools
    function getSettingBool(string memory _settingPath) public view override returns (bool) {
        return getBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
    }

    // Update a setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingBool(string memory _settingPath, bool _value) virtual public override onlyDAOProtocolProposal {
        // Update setting now
        setBool(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /*** Addresses  ****************/

    // A general method to return any setting given the setting path is correct, only accepts addresses
    function getSettingAddress(string memory _settingPath) external view override returns (address) {
        return getAddress(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
    }

    // Update a setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingAddress(string memory _settingPath, address _value) virtual external override onlyDAOProtocolProposal {
        // Update setting now
        setAddress(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /*** Address lists  ****************/

    // A general method to return any setting given the setting path is correct, only accepts address lists
    function getSettingAddressList(string memory _settingPath) public view override returns (address[] memory) {
        uint256 key = uint256(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
        uint256 count = getUint(bytes32(key));
        address[] memory addressList = new address[](count);
        for (uint256 i = 0; i < count; ++i) {
            addressList[i] = getAddress(bytes32(key + i));
        }
        return addressList;
    }

    // Update a setting, can only be executed by the DAO contract when a majority on a setting proposal has passed and been executed
    function setSettingAddressList(string memory _settingPath, address[] calldata _value) virtual public override onlyDAOProtocolProposal {
        uint256 key = uint256(keccak256(abi.encodePacked(settingNameSpace, _settingPath)));
        setUint(bytes32(key), _value.length);
        for (uint256 i = 0; i < _value.length; ++i) {
            setAddress(bytes32(key + i), _value[i]);
        }
    }
}
