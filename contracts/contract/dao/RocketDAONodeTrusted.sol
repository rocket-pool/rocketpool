pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/dao/RocketDAOInterface.sol";
import "../../interface/dao/RocketDAONodeTrustedInterface.sol";
import "../../interface/dao/RocketDAOProposalInterface.sol";
import "../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrusted is RocketBase, RocketDAOInterface, RocketDAONodeTrustedInterface { 

    using SafeMath for uint;

    // Events
    // event ProposalAdded(address indexed proposer, uint256 indexed proposalID, uint256 indexed proposalType, bytes payload, uint256 time);  

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';

    // Min amount of trusted node members required in the DAO
    uint256 memberMinCount = 3;

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
        require(getMemberCount() < getMemberCountMinRequired(), "Bootstrap mode not engaged, min DAO member count has been met");
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
        // Set some initial settings on first deployment
        if(!getBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")))) {
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")), 0.51 ether);
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "rplbond")), 15000 ether);
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "proposal.cooldown")), 13220);              // How long before a member can make sequential proposals. Approx. 2 days of blocks
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "proposal.vote.blocks")), 92550);           // How long a proposal can be voted on. Approx. 2 weeks worth of blocks
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "proposal.vote.delay.blocks")), 1);         // How long before a proposal can be voted on after it is created. Approx. Next Block
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "proposal.execute.blocks")), 185100);       // How long a proposal be in the queue to be executed. Approx. 4 weeks worth of blocks
            setBool(keccak256(abi.encodePacked(daoNameSpace, "deployed")), true);                                   // Flag that this contract has been deployed, so default settings don't get reapplied on a contract upgraded
        }
    }

    /*** Settings  ****************/

    // A general method to return any setting given the setting path is correct, only accepts uints
    function getSettingUint(string memory _settingPath) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", _settingPath)));
    } 
    

    /*** Proposals ****************/

    
    // Return the amount of votes need for a proposal to pass
    function getProposalQuorumVotesRequired() override public view returns (uint256) {
        // Get the total trusted nodes
        uint256 trustedNodeCount = getMemberCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount > 0 ? calcBase.div(trustedNodeCount) : 0;
        // Return the votes required
        return calcBase.mul(getSettingUint('quorum')).div(total);
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

    // Return the min number of members required for the DAO
    function getMemberCountMinRequired() override public view returns (uint256) { 
        return memberMinCount; 
    }

    // Return true if the node addressed passed is a member of the trusted node DAO
    function getMemberIsValid(address _nodeAddress) override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked("dao.trustednodes", "member", _nodeAddress))); 
    }

    // Get the last time this user made a proposal
    function getMemberLastProposalBlock(address _nodeAddress) override public view returns (uint256) { 
        return getUint(keccak256(abi.encodePacked("dao.trustednodes", "member.proposal.lastblock", _nodeAddress))); 
    }


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) override public onlyOwner onlyBootstrapMode onlyRegisteredNode(_nodeAddress) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("join(string,string,address)", _id, _email, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) override public onlyOwner onlyBootstrapMode {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("setting(string,uint256)", _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    
    /*** Proposals **********************/

    // Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    // A general message can be passed by the proposer along with the calldata payload that can be executed if the proposal passes
    function propose(string memory _proposalMessage, bytes memory _payload) override public onlyTrustedNode(msg.sender) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Check this user can make a proposal now
        require(getMemberLastProposalBlock(msg.sender).add(getSettingUint('proposal.cooldown')) >= block.number, "Member has not waited long enough to make another proposal");
        // Record the last time this user made a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lastblock", msg.sender)), block.number);
        // Create the proposal
        return daoProposal.add('rocketDAONodeTrusted', _proposalMessage, _payload);
    }


    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override public onlyTrustedNode(msg.sender) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }
 
    

    /*** Methods **********************/

    // A new DAO member joining, can only be done via a proposal or in bootstrap mode
    // Provide an ID that indicates who is running the trusted node and the address of the registered node that they wish to propose joining the dao
    function join(string memory _id, string memory _email, address _nodeAddress) override public onlyExecutingContracts onlyRegisteredNode(_nodeAddress) returns (bool) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check current node status
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))) != true, "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check email address length
        require(bytes(_email).length >= 6, "The email for this new member must be at least 6 characters");
        // Ok all good, lets get them setup
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), true);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress)), _email);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined", _nodeAddress)), block.number);
        // Add to index
        addressSetStorage.addItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _nodeAddress); 
        // Register for them to receive rewards now
        _rewardsEnable(_nodeAddress, true);
        // Done
        return true;
    }

    // Change one of the current settings of the trusted node DAO
    // Settings only support Uints currently
    function setting(string memory _settingPath, uint256 _value) override public onlyExecutingContracts() returns (bool) {
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("quorum"))) require(_value >= 0.51 ether && _value <= 0.9 ether, "Quorum setting must be >= 51% and <= 90%");
        // Ok all good, lets update
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", _settingPath)), _value);
    }



    /*** RPL Rewards ***********/
 
 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    function rewardsRegister(bool _enable) override public onlyTrustedNode(msg.sender) {
        _rewardsEnable(msg.sender, _enable);
    }


    // Enable a trusted node to register for receiving RPL rewards
    // Must be added when they join and removed when they leave
    function _rewardsEnable(address _nodeAddress, bool _enable) private onlyTrustedNode(_nodeAddress) {
        // Load contracts
        RocketClaimTrustedNodeInterface rewardsClaimTrustedNode = RocketClaimTrustedNodeInterface(getContractAddress("rocketClaimTrustedNode"));
        // Verify the trust nodes rewards contract is enabled 
        if(rewardsClaimTrustedNode.getEnabled()) {
            if(_enable) {
                // Register
                rewardsClaimTrustedNode.register(_nodeAddress, true); 
            }else{
                // Unregister
                rewardsClaimTrustedNode.register(_nodeAddress, false); 
            }
        }
    }
        

}
