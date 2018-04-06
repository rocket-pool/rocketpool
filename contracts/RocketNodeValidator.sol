pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/RocketUtilsInterface.sol";


/// @title The RocketNodeValidator contract for Casper validator functionality.
/// @author Rocket Pool
contract RocketNodeValidator is RocketBase {

    /** Events */

    event NodeVoteCast (
        uint128 epoch,
        address minipool_address,
        bytes vote_message
    );

    /** Modifiers */

    /// @dev Only registered pool node addresses can access
    /// @param _nodeAccountAddress node account address.
    modifier onlyRegisteredNode(address _nodeAccountAddress) {
        require(rocketStorage.getBool(keccak256("node.exists", _nodeAccountAddress)));
        _;
    }

    /// @dev rocket node validator constructor
    function RocketNodeValidator(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Cast Casper votes via minipools
    /// @param _epoch The epoch number voting relates to
    /// @param _minipool_address The address of the minipool that should cast the votes
    /// @param _vote_message Vote message to be sent to Casper
    function nodeVote(uint128 _epoch, address _minipool_address, bytes _vote_message) public onlyRegisteredNode(msg.sender) returns(bool) {
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        require(rocketPool.vote(_epoch, _minipool_address, _vote_message));
        NodeVoteCast(_epoch, _minipool_address, _vote_message);
        return true;
    }

}
