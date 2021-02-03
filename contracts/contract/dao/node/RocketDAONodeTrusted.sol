pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedActionsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedSettingsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrusted is RocketBase, RocketDAONodeTrustedInterface {

    using SafeMath for uint;

    // Events
    event MemberJoined(address indexed _nodeAddress, uint256 _rplBondAmount, uint256 time);  
    event MemberLeave(address indexed _nodeAddress, uint256 _rplBondAmount, uint256 time);

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';

    // Min amount of trusted node members required in the DAO
    uint256 daoMemberMinCount = 3;

    // Only allow bootstrapping the dao if it has less than the required members to form the DAO
    modifier onlyBootstrapMode() {
        require(getMemberCount() < daoMemberMinCount, "Bootstrap mode not engaged, min DAO member count has been met");
        _;
    }

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

    

    /*** Proposals ****************/

    
    // Return the amount of member votes need for a proposal to pass
    function getMemberQuorumVotesRequired() override public view returns (uint256) {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAOProtocolSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Get the total trusted nodes
        uint256 trustedNodeCount = getMemberCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount > 0 ? calcBase.div(trustedNodeCount) : 0;
        // Return the votes required
        return calcBase.mul(rocketDAOProtocolSettings.getQuorum()).div(total);
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
    function getMemberMinRequired() override public view returns (uint256) {
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
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", _proposalType, _nodeAddress))); 
    }

    // Get the RPL bond amount the user deposited to join
    function getMemberRPLBondAmount(address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress))); 
    }

    // Get an address that's either to be replaced or is being replaced
    function getMemberReplacedAddress(string memory _type, address _nodeAddress) override public view returns (address) { 
        return getAddress(keccak256(abi.encodePacked(daoNameSpace, "member.replace", _type, _nodeAddress))); 
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

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) override public onlyGuardian onlyBootstrapMode onlyRegisteredNode(_nodeAddress) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = getContractAddress('rocketDAONodeTrustedProposals').call(abi.encodeWithSignature("proposalInvite(string,string,address)", _id, _email, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress('rocketDAONodeTrustedProposals').call(abi.encodeWithSignature("proposalSettingUint(string,uint256)", _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

 
        

}
