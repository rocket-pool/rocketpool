pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/utils/lists/Bytes32SetStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDepositIndex - manages indexes of deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDepositIndex is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint256;


    /*** Contracts **************/


    Bytes32SetStorageInterface bytes32SetStorage = Bytes32SetStorageInterface(0);


    /*** Methods ****************/


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Add a deposit
    // Returns the new deposit ID
    function add(address _userID, address _groupID, string memory _durationID, uint256 _amount) public onlyLatestContract("rocketDeposit", msg.sender) returns (bytes32) {

        // Get user deposit nonce
        uint depositIDNonce = rocketStorage.getUint(keccak256(abi.encodePacked("user.deposit.nonce", _userID, _groupID, _durationID))).add(1);
        rocketStorage.setUint(keccak256(abi.encodePacked("user.deposit.nonce", _userID, _groupID, _durationID)), depositIDNonce);

        // Get deposit ID
        bytes32 depositID = keccak256(abi.encodePacked("deposit", _userID, _groupID, _durationID, depositIDNonce));
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", depositID))), "Deposit ID already in use");

        // Set deposit details
        rocketStorage.setBool(keccak256(abi.encodePacked("deposit.exists", depositID)), true);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.userID", depositID)), _userID);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.groupID", depositID)), _groupID);
        rocketStorage.setString(keccak256(abi.encodePacked("deposit.stakingDurationID", depositID)), _durationID);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.totalAmount", depositID)), _amount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)), _amount);
        // + stakingAmount
        // + stakingPools
        // + stakingPoolAmount
        // + refundedAmount
        // + withdrawnAmount

        // Update deposit indexes
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32SetStorage.addItem(keccak256(abi.encodePacked("user.deposits", _userID, _groupID, _durationID)), depositID);

        // Return ID
        return depositID;

    }


}
