pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMembersInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrusted is RocketBase, RocketDAONodeTrustedInterface {

    using SafeMath for uint;

    // Calculate using this as the base
    uint256 constant calcBase = 1 ether;

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
    function getMemberQuorumVotesRequired() override public view returns (uint256) {
        // Load contracts
        RocketDAONodeTrustedSettingsMembersInterface rocketDAONodeTrustedSettingsMembers = RocketDAONodeTrustedSettingsMembersInterface(getContractAddress("rocketDAONodeTrustedSettingsMembers"));
        // Calculate and return votes required
        return getMemberCount().mul(rocketDAONodeTrustedSettingsMembers.getQuorum());
    }


    /*** Members ******************/

    // Return true if the node addressed passed is a member of the trusted node DAO
    function getMemberIsValid(address _nodeAddress) override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))); 
    }
    
    // Get a trusted node member address by index
    function getMemberAt(uint256 _index) override public view returns (address) { 
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _index);
    }

    // Total number of members in the current trusted node DAO
    function getMemberCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked(daoNameSpace, "member.index")));
    }

    // Min required member count for the DAO 
    function getMemberMinRequired() override public pure returns (uint256) {
        return daoMemberMinCount;
    }

    // Get the last time this user made a proposal
    function getMemberLastProposalBlock(address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lastblock", _nodeAddress))); 
    }

    // Get the ID of a trusted node member
    function getMemberID(address _nodeAddress) override public view returns (string memory) { 
        return getString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress))); 
    }

    // Get the email of a trusted node member
    function getMemberEmail(address _nodeAddress) override public view returns (string memory) { 
        return getString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress))); 
    }

    // Get the block the member joined at
    function getMemberJoinedBlock(address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.block", _nodeAddress))); 
    } 

    // Get data that was recorded about a proposal that was executed
    function getMemberProposalExecutedBlock(string memory _proposalType, address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.block", _proposalType, _nodeAddress))); 
    }

    // Get the RPL bond amount the user deposited to join
    function getMemberRPLBondAmount(address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress))); 
    }

    // Is this member currently being 'challenged' to see if their node is responding
    function getMemberIsChallenged(address _nodeAddress) override public view returns (bool) { 
        // Has this member been challenged recently and still within the challenge window to respond? If there is a challenge block recorded against them, they are actively being challenged.
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.challenged.block", _nodeAddress))) > 0 ? true : false;
    }

    // How many unbonded validators this member has
    function getMemberUnbondedValidatorCount(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.validator.unbonded.count", _nodeAddress)));
    }
    function setMemberUnbondedValidatorCount(address _nodeAddress, uint256 _value) private {
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.validator.unbonded.count", _nodeAddress)), _value);
    }

    // Increment/decrement a member's unbonded validator count
    // Only accepts calls from the RocketMinipoolManager contract
    function incrementMemberUnbondedValidatorCount(address _nodeAddress) override external onlyLatestContract("rocketDAONodeTrusted", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) {
        setMemberUnbondedValidatorCount(_nodeAddress, getMemberUnbondedValidatorCount(_nodeAddress).add(1));
    }
    function decrementMemberUnbondedValidatorCount(address _nodeAddress) override external onlyLatestContract("rocketDAONodeTrusted", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) {
        setMemberUnbondedValidatorCount(_nodeAddress, getMemberUnbondedValidatorCount(_nodeAddress).sub(1));
    }


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - In bootstrap mode, guardian can add members at will
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) override public onlyGuardian onlyBootstrapMode onlyRegisteredNode(_nodeAddress) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = getContractAddress("rocketDAONodeTrustedProposals").call(abi.encodeWithSignature("proposalInvite(string,string,address)", _id, _email, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }


    // Bootstrap mode - Uint Setting
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress("rocketDAONodeTrustedProposals").call(abi.encodeWithSignature("proposalSettingUint(string,string,uint256)", _settingContractName, _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Bool Setting
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress("rocketDAONodeTrustedProposals").call(abi.encodeWithSignature("proposalSettingBool(string,string,bool)", _settingContractName, _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }


    // Bootstrap mode - Upgrade contracts or their ABI
    function bootstrapUpgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress("rocketDAONodeTrustedProposals").call(abi.encodeWithSignature("proposalUpgrade(string,string,string,address)", _type, _name, _contractAbi, _contractAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        require(_confirmDisableBootstrapMode == true, "You must confirm disabling bootstrap mode, it can only be done once!");
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true); 
    }

 
    /**** Recovery ***************/
        
    // In an explicable black swan scenario where the DAO loses more than the min membership required (3), this method can be used by a regular node operator to join the DAO
    // Must have their ID, email, current RPL bond amount available and must be called by their current registered node account
    function memberJoinRequired(string memory _id, string memory _email) override public onlyLowMemberMode onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets add them 
        (bool successPropose, bytes memory responsePropose) = getContractAddress("rocketDAONodeTrustedProposals").call(abi.encodeWithSignature("proposalInvite(string,string,address)", _id, _email, msg.sender));
        // Was there an error?
        require(successPropose, getRevertMsg(responsePropose));
        // Get the to automatically join as a member (by a regular proposal, they would have to manually accept, but this is no ordinary situation)
        (bool successJoin, bytes memory responseJoin) = getContractAddress("rocketDAONodeTrustedActions").call(abi.encodeWithSignature("actionJoinRequired(address)", msg.sender));
        // Was there an error?
        require(successJoin, getRevertMsg(responseJoin));
    }

}
