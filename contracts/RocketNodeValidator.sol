pragma solidity 0.4.23;


import "./RocketNodeBase.sol";
import "./interface/RocketPoolInterface.sol";


/// @title The RocketNodeValidator contract for Casper validator functionality.
/// @author Rocket Pool
contract RocketNodeValidator is RocketNodeBase {

    /** Events */

    event NodeVoteCast (
        uint256 epoch,
        address minipool_address,
        bytes vote_message
    );

    event NodeLogout (
        address minipool_address,
        bytes logout_message
    );

    /// @dev rocket node validator constructor
    constructor(address _rocketStorageAddress) RocketNodeBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Cast Casper votes via minipools
    /// @param _epoch The epoch number voting relates to
    /// @param _minipoolAddress The address of the minipool that should cast the votes
    /// @param _voteMessage Vote message to be sent to Casper
    function minipoolVote(uint256 _epoch, address _minipoolAddress, bytes _voteMessage) public onlyRegisteredNode(msg.sender) returns(bool) {

        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        
        // minipool is a defined address?
        require(_minipoolAddress != 0x0);

        // vote message has contents
        require(_voteMessage.length > 0);

        // cast vote
        rocketPool.vote(msg.sender, _epoch, _minipoolAddress, _voteMessage);
        
        // fire event on success
        emit NodeVoteCast(_epoch, _minipoolAddress, _voteMessage);
        return true;
    }

    /// @dev Log the minipool out of Casper and wait for withdrawal
    /// @param _minipoolAddress The address of the minipool to logout of Casper
    /// @param _logout_message The constructed logout message from the node containing RLP encoded: [validator_index, epoch, node signature]
    function minipoolLogout(address _minipoolAddress, bytes _logout_message) public onlyRegisteredNode(msg.sender) returns(bool) {

        // minipool is a defined address?
        require(_minipoolAddress != 0x0);

        // logout message has contents
        require(_logout_message.length > 0);

        // request logout from Casper
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        rocketPool.logout(msg.sender, _minipoolAddress, _logout_message);
        
        // fire event on success
        emit NodeLogout(_minipoolAddress, _logout_message);
    }

}