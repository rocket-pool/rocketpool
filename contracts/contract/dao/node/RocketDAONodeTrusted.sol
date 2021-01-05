pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
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

    // Possible states that a trusted node proposal may be in
    enum ProposalType {
        Invite,             // Invite a registered node to join the trusted node DAO
        Leave,              // Leave the DAO 
        Replace,            // Replace a current trusted node with a new registered node
        Kick,               // Kick a member from the DAO with optional penalty applied to their RPL deposit
        Setting             // Change a DAO setting (Quorum threshold, RPL deposit size, voting periods etc)
    }


    // Only allow bootstrapping the dao if it has less than the required members to form the DAO
    modifier onlyBootstrapMode() {
        require(getMemberCount() < daoMemberMinCount, "Bootstrap mode not engaged, min DAO member count has been met");
        _;
    }

    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        require(msg.sender == address(this) || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    

    /*** Proposals ****************/

    
    // Return the amount of member votes need for a proposal to pass
    function getMemberQuorumVotesRequired() override public view returns (uint256) {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAOSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Get the total trusted nodes
        uint256 trustedNodeCount = getMemberCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount > 0 ? calcBase.div(trustedNodeCount) : 0;
        // Return the votes required
        return calcBase.mul(rocketDAOSettings.getQuorum()).div(total);
    }


    /*** Members ******************/

    
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

    // Return true if the node addressed passed is a member of the trusted node DAO
    function getMemberIsValid(address _nodeAddress) override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))); 
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


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) override public onlyOwner onlyBootstrapMode onlyRegisteredNode(_nodeAddress) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("proposalInvite(string,string,address)", _id, _email, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) override public onlyOwner onlyBootstrapMode onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("proposalSetting(string,uint256)", _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    
    /*** Proposals **********************/

    // Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    // A general message can be passed by the proposer along with the calldata payload that can be executed if the proposal passes
    function propose(string memory _proposalMessage, bytes memory _payload) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrusted", address(this)) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        RocketDAONodeTrustedSettingsInterface rocketDAOSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Check this user can make a proposal now
        require(getMemberLastProposalBlock(msg.sender).add(rocketDAOSettings.getProposalCooldown()) >= block.number, "Member has not waited long enough to make another proposal");
        // Record the last time this user made a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lastblock", msg.sender)), block.number);
        // Create the proposal
        return daoProposal.add(msg.sender, getContractName(address(this)), _proposalMessage, block.number.add(rocketDAOSettings.getProposalVoteDelayBlocks()), rocketDAOSettings.getProposalVoteBlocks(), rocketDAOSettings.getProposalExecuteBlocks(), getMemberQuorumVotesRequired(), _payload);
    }


    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Did they join after this proposal was created? If so, they can't vote or it'll throw off the set proposalVotesRequired 
        require(getMemberJoinedBlock(msg.sender) < daoProposal.getCreated(_proposalID), "Member cannot vote on proposal created before they became a member");
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }


    // Cancel a proposal 
    function cancel(uint256 _proposalID) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrusted", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }
 

    /*** Proposal Methods **********************/

    // A new DAO member being invited, can only be done via a proposal or in bootstrap mode
    // Provide an ID that indicates who is running the trusted node and the address of the registered node that they wish to propose joining the dao
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) override public onlyExecutingContracts onlyRegisteredNode(_nodeAddress) {
        // Their proposal executed, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "invited", _nodeAddress)), block.number);
        // Ok all good, lets get their invitation and member data setup
        // They are initially only invited to join, so their membership isn't set as true until they accept it in RocketDAONodeTrustedActions
        _memberInit(_id, _email, _nodeAddress);
    }


    // A current member proposes leaving the trusted node DAO, when successful they will be allowed to collect their RPL bond
    function proposalLeave(address _nodeAddress) override public onlyExecutingContracts onlyTrustedNode(_nodeAddress) { 
        // Check this wouldn't dip below the min required trusted nodes (also checked when the node has a successful proposal and attempts to exit)
        require(getMemberCount() > daoMemberMinCount, "Member count will fall below min required, this member must choose to be replaced");
        // Their proposal to leave has been accepted, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "leave", _nodeAddress)), block.number);
    }


    // A current member proposes replacing themselves as a member with a new member who will take over their RPL bond
    // Member who is proposing to be replaced, must action the method in the actions contract to confirm they want to be replaced
    function proposalReplace(address _memberNodeAddress, string memory _replaceId, string memory _replaceEmail, address _replaceNodeAddress) override public onlyExecutingContracts onlyTrustedNode(_memberNodeAddress) onlyRegisteredNode(_replaceNodeAddress) { 
        // Their proposal to be replaced has been accepted, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "replace", _replaceNodeAddress)), block.number);
        // Initialise the new prospective members details
        _memberInit(_replaceId, _replaceEmail, _replaceNodeAddress);
        // Their proposal to be replaced has been accepted
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.replace", "new", _memberNodeAddress)), _replaceNodeAddress);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.replace", "current", _memberNodeAddress)), _memberNodeAddress);
    }
    

    // Change one of the current settings of the trusted node DAO
    // Settings only support Uints currently
    function proposalSetting(string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAOSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("quorum"))) require(_value >= 0.51 ether && _value <= 0.9 ether, "Quorum setting must be >= 51% and <= 90%");
        // Ok all good, lets update
        rocketDAOSettings.setSettingUint(_settingPath, _value);
    }


    // Add a new potential members data, they are not official members yet, just propsective
    function _memberInit(string memory _id, string memory _email, address _nodeAddress) private onlyRegisteredNode(_nodeAddress) {
        // Check current node status
        require(!getMemberIsValid(_nodeAddress), "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check email address length
        require(bytes(_email).length >= 6, "The email for this new member must be at least 6 characters");
        // Member initial data, not official until the bool is flagged as true
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), false);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress)), _email);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress)), 0);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.block", _nodeAddress)), 0);
    }
        

}
