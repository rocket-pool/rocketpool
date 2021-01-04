pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedActionsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedSettingsInterface.sol";
import "../../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";
import "../../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// The Trusted Node DAO Actions
contract RocketDAONodeTrustedActions is RocketBase, RocketDAONodeTrustedActionsInterface { 

    using SafeMath for uint;

    // Events
    event ActionJoined(address indexed _nodeAddress, uint256 _rplBondAmount, uint256 time);  
    event ActionLeave(address indexed _nodeAddress, uint256 _rplBondAmount, uint256 time);

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

 

  
    /*** Action Methods ************************/

    // When a new member has been successfully invited to join, they must call this method to join officially
    // They will be required to have the RPL bond amount in their account
    function actionJoin() override external onlyRegisteredNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedActions", address(this)) {
        // Set some intiial contract address
        address rocketVaultAddress = getContractAddress('rocketVault');
        address rocketTokenRPLAddress = getContractAddress('rocketTokenRPL');
        // Load contracts
        IERC20 rplInflationContract = IERC20(rocketTokenRPLAddress);
        RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
        RocketDAONodeTrustedInterface rocketDAONode = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsInterface rocketDAONodeSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // The block that the member was successfully invited to join the DAO
        uint256 memberInvitedBlock = rocketDAONode.getMemberInvitedBlock(msg.sender);
        // The current member bond amount in RPL that's required
        uint256 rplBondAmount = rocketDAONodeSettings.getRPLBond();
        // Check current node status
        require(rocketDAONode.getMemberIsValid(msg.sender) != true, "This node is already part of the trusted node DAO");
        // Have they actually been invited?
        require(memberInvitedBlock != 0, "This node has not been successfully invited to join the DAO");
        // Has their invite expired?
        require(memberInvitedBlock.add(rocketDAONodeSettings.getProposalActionBlocks()) > block.number, "This nodes invitation to join has expired, please apply again");
        // Verify they have allowed this contract to spend their RPL for the bond
        require(rplInflationContract.allowance(msg.sender, address(this)) >= rplBondAmount, "Not enough allowance given to RocketDAONodeTrusted contract for transfer of RPL bond tokens");
        // Transfer the tokens to this contract now
        require(rplInflationContract.transferFrom(msg.sender, address(this), rplBondAmount), "Token transfer to RocketDAONodeTrusted contract was not successful");
        // Allow RocketVault to transfer these tokens to itself now
        require(rplInflationContract.approve(rocketVaultAddress, rplBondAmount), "Approval for RocketVault to spend RocketDAONodeTrusted RPL bond tokens was not successful");
        // Let vault know it can move these tokens to itself now and credit the balance to this contract
        require(rocketVault.depositToken(getContractName(address(this)), rocketTokenRPLAddress, rplBondAmount), "Rocket Vault RPL bond deposit deposit was not successful");
        // Flag them as a member now that they have accepted the invitation and record the size of the bond they paid
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender)), true);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", msg.sender)), rplBondAmount);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.block", msg.sender)), block.number);
         // Add to member index now
        addressSetStorage.addItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), msg.sender); 
        // Register for them to receive rewards now
        _rewardsEnable(msg.sender, true);
        // Log it
        emit ActionJoined(msg.sender, rplBondAmount, now);
    }
    

    // When a new member has successfully requested to leave with a proposal, they must call this method to leave officially and receive their RPL bond
    function actionLeave(address _rplBondRefundAddress) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedActions", address(this)) {
        // Load contracts
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress('rocketVault'));
        RocketDAONodeTrustedInterface rocketDAONode = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsInterface rocketDAONodeSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check this wouldn't dip below the min required trusted nodes
        require(rocketDAONode.getMemberCount() > rocketDAONode.getMemberMinRequired(), "Member count will fall below min required, this member must choose to be replaced");
        // Check they were successful in their proposal to leave
        require(rocketDAONode.getMemberLeaveAccepted(msg.sender), "Member has not made a successful leave proposal to the DAO");
        // Has their leave request expired?
        require(rocketDAONode.getMemberLeaveAcceptedBlock(msg.sender).add(rocketDAONodeSettings.getProposalActionBlocks()) > block.number, "This members leave request has expired, please apply to leave again");
        // Unregister them from the rewards pool
        _rewardsEnable(msg.sender, false);
        // Revoke membership now
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender)), false);
        // Update membership index
        addressSetStorage.removeItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), msg.sender); 
        // They were succesful, lets refund their RPL Bond
        uint256 rplBondRefundAmount = rocketDAONode.getMemberRPLBondAmount(msg.sender);
        // Refund
        if(rplBondRefundAmount > 0) {
            // Valid withdrawal address
            require(_rplBondRefundAddress != address(0x0), "Member has not supplied a valid address for their RPL bond refund");
            // Send tokens now
            require(rocketVault.withdrawToken(_rplBondRefundAddress, getContractAddress('rocketTokenRPL'), rplBondRefundAmount), "Could not send RPL bond token balance from vault");
        }
        // Log it
        emit ActionLeave(msg.sender, rplBondRefundAmount, now);
    }


    /*** RPL Rewards ***********/
 
 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    function actionRewardsRegister(bool _enable) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedActions", address(this)) {
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
