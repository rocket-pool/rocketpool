pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedProposalsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedActionsInterface.sol";
import "../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMembersInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrusted is RocketBase, RocketDAONodeTrustedInterface {

    using SafeMath for uint;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant daoNameSpace = "dao.trustednodes.";

    // Min amount of trusted node members required in the DAO
    uint256 constant daoMemberMinCount = 3;


    // Only allow bootstrapping when enabled
    modifier onlyBootstrapMode() {
        require(getBootstrapModeDisabled() == false, "Bootstrap mode not engaged");
        _;
    }

    // Only when the DAO needs new members due to being below the required min
    modifier onlyLowMemberMode() {
        require(getMemberCount() < daoMemberMinCount, "Low member mode not engaged");
        _;
    }
    

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }



    /**** DAO Properties **************/

    // Returns true if bootstrap mode is disabled
    function getBootstrapModeDisabled() override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled"))); 
    }
    

    /*** Proposals ****************/

    
    // Return the amount of member votes need for a proposal to pass
    function getMemberQuorumVotesRequired() override external view returns (uint256) {
        // Load contracts
        RocketDAONodeTrustedSettingsMembersInterface rocketDAONodeTrustedSettingsMembers = RocketDAONodeTrustedSettingsMembersInterface(getContractAddress("rocketDAONodeTrustedSettingsMembers"));
        // Calculate and return votes required
        return getMemberCount().mul(rocketDAONodeTrustedSettingsMembers.getQuorum());
    }


    /*** Members ******************/

    // Return true if the node addressed passed is a member of the trusted node DAO
    function getMemberIsValid(address _nodeAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))); 
    }
    
    // Get a trusted node member address by index
    function getMemberAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _index);
    }

    // Total number of members in the current trusted node DAO
    function getMemberCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked(daoNameSpace, "member.index")));
    }

    // Min required member count for the DAO 
    function getMemberMinRequired() override external pure returns (uint256) {
        return daoMemberMinCount;
    }

    // Get the last time this user made a proposal
    function getMemberLastProposalTime(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lasttime", _nodeAddress)));
    }

    // Get the ID of a trusted node member
    function getMemberID(address _nodeAddress) override external view returns (string memory) {
        return getString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress))); 
    }

    // Get the URL of a trusted node member
    function getMemberUrl(address _nodeAddress) override external view returns (string memory) {
        return getString(keccak256(abi.encodePacked(daoNameSpace, "member.url", _nodeAddress))); 
    }

    // Get the block the member joined at
    function getMemberJoinedTime(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.time", _nodeAddress)));
    } 

    // Get data that was recorded about a proposal that was executed
    function getMemberProposalExecutedTime(string memory _proposalType, address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", _proposalType, _nodeAddress)));
    }

    // Get the RPL bond amount the user deposited to join
    function getMemberRPLBondAmount(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress))); 
    }

    // Is this member currently being 'challenged' to see if their node is responding
    function getMemberIsChallenged(address _nodeAddress) override external view returns (bool) {
        // Has this member been challenged recently and still within the challenge window to respond? If there is a challenge block recorded against them, they are actively being challenged.
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.challenged.time", _nodeAddress))) > 0 ? true : false;
    }

    // How many unbonded validators this member has
    function getMemberUnbondedValidatorCount(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.validator.unbonded.count", _nodeAddress)));
    }

    // Increment/decrement a member's unbonded validator count
    // Only accepts calls from the RocketMinipoolManager contract
    function incrementMemberUnbondedValidatorCount(address _nodeAddress) override external onlyLatestContract("rocketDAONodeTrusted", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) {
        addUint(keccak256(abi.encodePacked(daoNameSpace, "member.validator.unbonded.count", _nodeAddress)), 1);
    }
    function decrementMemberUnbondedValidatorCount(address _nodeAddress) override external onlyLatestContract("rocketDAONodeTrusted", address(this)) onlyRegisteredMinipool(msg.sender) {
        subUint(keccak256(abi.encodePacked(daoNameSpace, "member.validator.unbonded.count", _nodeAddress)), 1);
    }


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - In bootstrap mode, guardian can add members at will
    function bootstrapMember(string memory _id, string memory _url, address _nodeAddress) override external onlyGuardian onlyBootstrapMode onlyRegisteredNode(_nodeAddress) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets add them
        RocketDAONodeTrustedProposalsInterface(getContractAddress("rocketDAONodeTrustedProposals")).proposalInvite(_id, _url, _nodeAddress);
    }


    // Bootstrap mode - Uint Setting
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAONodeTrustedProposalsInterface(getContractAddress("rocketDAONodeTrustedProposals")).proposalSettingUint(_settingContractName, _settingPath, _value);
    }

    // Bootstrap mode - Bool Setting
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAONodeTrustedProposalsInterface(getContractAddress("rocketDAONodeTrustedProposals")).proposalSettingBool(_settingContractName, _settingPath, _value);
    }


    // Bootstrap mode - Upgrade contracts or their ABI
    function bootstrapUpgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAONodeTrustedProposalsInterface(getContractAddress("rocketDAONodeTrustedProposals")).proposalUpgrade(_type, _name, _contractAbi, _contractAddress);
    }

    // Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        require(_confirmDisableBootstrapMode == true, "You must confirm disabling bootstrap mode, it can only be done once!");
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true); 
    }

 
    /**** Recovery ***************/
        
    // In an explicable black swan scenario where the DAO loses more than the min membership required (3), this method can be used by a regular node operator to join the DAO
    // Must have their ID, URL, current RPL bond amount available and must be called by their current registered node account
    function memberJoinRequired(string memory _id, string memory _url) override external onlyLowMemberMode onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAONodeTrustedProposalsInterface(getContractAddress("rocketDAONodeTrustedProposals")).proposalInvite(_id, _url, msg.sender);
        // Get the to automatically join as a member (by a regular proposal, they would have to manually accept, but this is no ordinary situation)
        RocketDAONodeTrustedActionsInterface(getContractAddress("rocketDAONodeTrustedActions")).actionJoinRequired(msg.sender);
    }

}
