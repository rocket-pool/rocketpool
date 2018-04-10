pragma solidity 0.4.19;


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

    /// @dev rocket node validator constructor
    function RocketNodeValidator(address _rocketStorageAddress) RocketNodeBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Cast Casper votes via minipools
    /// @param _epoch The epoch number voting relates to
    /// @param _minipool_address The address of the minipool that should cast the votes
    /// @param _vote_message Vote message to be sent to Casper
    function nodeVote(uint256 _epoch, address _minipool_address, bytes _vote_message) public onlyRegisteredNode(msg.sender) returns(bool) {
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        require(rocketPool.vote(_epoch, _minipool_address, _vote_message));
        NodeVoteCast(_epoch, _minipool_address, _vote_message);
        return true;
    }

}
