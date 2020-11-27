pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/node/RocketNodeTrustedDAOInterface.sol";
import "../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";


// The Trusted Node DAO
contract RocketNodeTrustedDAO is RocketBase, RocketNodeTrustedDAOInterface {

    // Events
    //event RPLTokensSentDAO(address indexed from, address indexed to, uint256 amount, uint256 time);  

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';


    // Possible states that a proposal may be in
    enum ProposalType {
        Join,               // Join the DAO
        Leave,              // Leave the DAO 
        Kick                // Kick a member from the DAO with optional penalty applied to their RPL deposit
    }

    // Possible states that a proposal may be in
    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    // A registered RP node wishes to join the trusted node DAO
    function join() override public onlyRegisteredNode(msg.sender) returns (bool) {
        // Check current node status
        require(getBool(keccak256(abi.encodePacked("node.trusted", msg.sender))) != true, "This node is already part of the trusted node DAO");
    }



    /*** RPL Rewards ***********/

 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    function rewardsRegister(bool _enable) override public onlyTrustedNode(msg.sender) {
        rewardsEnable(msg.sender, _enable);
    }


    // Enable a trusted node to register for receiving RPL rewards
    // Must be added when they join and removed when they leave
    function rewardsEnable(address _nodeAddress, bool _enable) private onlyTrustedNode(_nodeAddress) {
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
