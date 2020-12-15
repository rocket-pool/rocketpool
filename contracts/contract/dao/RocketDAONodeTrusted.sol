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
        Setting             // Change a DAO setting (Quorum, RPL deposit sie, voting periods etc)
        //Quorum              // Set the quorum required to pass a proposal ( min: 51%, max 90% )
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
        // Set some initial settings
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")), 0.51 ether);
    }



    /*** Settings  ****************/

    // A general method to return any setting given the setting path is correct, only accepts uints
    function getSetting(string memory _settingPath) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", _settingPath)));
    } 
    
    // Return the current % the DAO is using for a quorum
    function getSettingQuorumThreshold() override public view returns (uint256) {
        // Specified as % of 1 ether
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")));
    } 

    // Return the current RPL bond size required to join
    function getSettingRPLBondSize() override public view returns (uint256) {
        // Specified as % of 1 ether
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "rplbond")));
    } 


    /*** Proposals ****************/

    
    // Return the amount of votes need for a proposal to pass
    function getProposalQuorumVotesRequired() override public view returns (uint256) {
        // Get the total trusted nodes
        uint256 trustedNodeCount = getMemberCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount > 0 ? calcBase.div(trustedNodeCount) : 0;
        // Return the votes required
        return calcBase.mul(getSettingQuorumThreshold()).div(total);
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


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, string memory _message, address _nodeAddress) override public onlyOwner onlyBootstrapMode onlyRegisteredNode(_nodeAddress) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("invite(string,string,string,address)", _id, _email, _message, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSetting(string memory _settingPath, uint256 _value) override public onlyOwner onlyBootstrapMode {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("setting(string,uint256)", _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    
    /*** Methods **********************/


    // A current DAO member wishes to invite a registered node to join the DAO
    // Provide an ID that indicates who is running the trusted node, an optional general message and the address of the registered node that they wish to propose joining the dao
    function invite(string memory _id, string memory _email, string memory _message, address _nodeAddress) override public onlyExecutingContracts onlyRegisteredNode(_nodeAddress) returns (bool) {
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
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.message", _nodeAddress)), _message);
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
