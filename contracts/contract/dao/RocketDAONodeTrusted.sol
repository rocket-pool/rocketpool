pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/dao/RocketDAOInterface.sol";
import "../../interface/dao/RocketDAONodeTrustedInterface.sol";
import "../../interface/dao/RocketDAOProposalInterface.sol";
import "../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// The Trusted Node DAO 
contract RocketDAONodeTrusted is RocketBase, RocketDAOInterface, RocketDAONodeTrustedInterface { 

    using SafeMath for uint;

    // Events
    // event ProposalAdded(address indexed proposer, uint256 indexed proposalID, uint256 indexed proposalType, bytes payload, uint256 time);  
    event Uint(uint256 indexed flag);  

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
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")), 0.51 ether);                    // Quorum threshold that must be met for proposals to pass
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "rplbond")), 15000 ether);                  // Bond amount required for a new member to join
            setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "invite.expire.blocks")), 185100);          // Successful members have this long to accept the invitation to join or they must be invited again. Approx. 4 weeks worth of blocks
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

    // Get the ID of a trusted node member
    function getMemberID(address _nodeAddress) override public view returns (string memory) { 
        return getString(keccak256(abi.encodePacked("dao.trustednodes", "member.id", _nodeAddress))); 
    }

    // Get the email of a trusted node member
    function getMemberEmail(address _nodeAddress) override public view returns (string memory) { 
        return getString(keccak256(abi.encodePacked("dao.trustednodes", "member.email", _nodeAddress))); 
    }


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) override public onlyOwner onlyBootstrapMode onlyRegisteredNode(_nodeAddress) {
        // Ok good to go, lets add them
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("proposalInvite(string,string,address)", _id, _email, _nodeAddress));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) override public onlyOwner onlyBootstrapMode {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = address(this).call(abi.encodeWithSignature("proposalSetting(string,uint256)", _settingPath, _value));
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
        return daoProposal.add(msg.sender, 'rocketDAONodeTrusted', _proposalMessage, _payload);
    }


    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override public onlyTrustedNode(msg.sender) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }


    // Cancel a proposal 
    function cancel(uint256 _proposalID) override public onlyTrustedNode(msg.sender) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }
 

    /*** Proposal Methods **********************/

    // A new DAO member being invited, can only be done via a proposal or in bootstrap mode
    // Provide an ID that indicates who is running the trusted node and the address of the registered node that they wish to propose joining the dao
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) override public onlyExecutingContracts onlyRegisteredNode(_nodeAddress) returns (bool) {
        // Check current node status
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))) != true, "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check email address length
        require(bytes(_email).length >= 6, "The email for this new member must be at least 6 characters");
        // Ok all good, lets get their invitation and member data setup
        // They are initially only invited to join, so their membership isn't set as true until they accept it in 'memberJoin()'
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), false);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress)), _email);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.invited.block", _nodeAddress)), block.number);
        // Done
        return true;
    }
    

    // Change one of the current settings of the trusted node DAO
    // Settings only support Uints currently
    function proposalSetting(string memory _settingPath, uint256 _value) override public onlyExecutingContracts() returns (bool) {
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("quorum"))) require(_value >= 0.51 ether && _value <= 0.9 ether, "Quorum setting must be >= 51% and <= 90%");
        // Ok all good, lets update
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", _settingPath)), _value);
    }


    /*** Member Methods ************************/

    // When a new member has been successfully invited to join, they must call this method to join officially
    // They will be required to have the RPL bond amount in their account
    function memberJoin() override external onlyRegisteredNode(msg.sender) {
        // Set some intiial contract address
        address rocketVaultAddress = getContractAddress('rocketVault');
        address rocketTokenRPLAddress = getContractAddress('rocketTokenRPL');
        // The current member bond amount in RPL that's required
        uint256 rplBondAmount = getSettingUint('rplbond');
        // The block that the member was successfully invited to join the DAO
        uint256 memberInvitedBlock = getUint(keccak256(abi.encodePacked(daoNameSpace, "member.invited.block", msg.sender)));
        // Load contracts
        IERC20 rplInflationContract = IERC20(rocketTokenRPLAddress);
        RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check current node status
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender))) != true, "This node is already part of the trusted node DAO");
        // Have they actually been invited?
        require(memberInvitedBlock != 0, "This node has not been successfully invited to join the DAO");
        // Has their invite expired?
        require(memberInvitedBlock.add(getSettingUint('invite.expire.blocks')) > block.number, "This nodes invitation to join has expired, please apply again");
        // Verify they have allowed this contract to spend their RPL for the bond
        require(rplInflationContract.allowance(msg.sender, address(this)) >= rplBondAmount, "Not enough allowance given to RocketDAONodeTrusted contract for transfer of RPL bond tokens");
        // Transfer the tokens to this contract now
        require(rplInflationContract.transferFrom(msg.sender, address(this), rplBondAmount), "Token transfer to RocketDAONodeTrusted contract was not successful");
        // Allow RocketVault to transfer these tokens to itself now
        require(rplInflationContract.approve(rocketVaultAddress, rplBondAmount), "Approval for RocketVault to spend RocketDAONodeTrusted RPL bond tokens was not successful");
        // Let vault know it can move these tokens to itself now and credit the balance to this contract
        require(rocketVault.depositToken('rocketDAONodeTrusted', rocketTokenRPLAddress, rplBondAmount), "Rocket Vault RPL bond deposit deposit was not successful");
        // Flag them as a member now that they have accepted the invitation and record the size of the bond they paid
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender)), true);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", msg.sender)), rplBondAmount);
         // Add to member index now
        addressSetStorage.addItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), msg.sender); 
        // Register for them to receive rewards now
        _rewardsEnable(msg.sender, true);
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
