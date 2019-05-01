pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../interface/utils/lists/Bytes32SetStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDepositIndex - manages indexes of deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDepositIndex is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint256;


    /*** Contracts **************/


    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);
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


    // Handle a refund of a queued deposit
    function refund(bytes32 _depositID, uint256 _refundAmount) public onlyLatestContract("rocketDeposit", msg.sender) {

        // Decrease queued amount to zero
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)), 0);

        // Increase refunded amount
        uint256 refundedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)), refundedAmount.add(_refundAmount));

    }


    // Handle a refund of a deposit fragment from a stalled minipool
    function refundFromStalledMinipool(bytes32 _depositID, address _minipool, uint256 _refundAmount) public onlyLatestContract("rocketDeposit", msg.sender) {

        // Decrease staking amount
        uint256 stakingAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)), stakingAmount.sub(_refundAmount));

        // Increase refunded amount
        uint256 refundedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)), refundedAmount.add(_refundAmount));

        // Remove staking pool
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        addressSetStorage.removeItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), 0);

    }


    // Handle a withdrawal of a deposit fragment from a minipool
    function withdrawFromMinipool(bytes32 _depositID, address _minipool, uint256 _withdrawalAmount) public onlyLatestContract("rocketDeposit", msg.sender) {

        // Decrease staking amount
        uint256 stakingAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)), stakingAmount.sub(_withdrawalAmount));

        // Increase withdrawn amount
        uint256 withdrawnAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.withdrawnAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.withdrawnAmount", _depositID)), withdrawnAmount.add(_withdrawalAmount));

        // Decrease staking pool amount
        uint256 stakingPoolAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool))).sub(_withdrawalAmount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), stakingPoolAmount);

        // Remove staking pool if user left pool
        if (stakingPoolAmount == 0) {
            addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
            addressSetStorage.removeItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool);
        }

    }


    // Check if deposit details are valid
    // Ignores user ID if null
    function checkDepositDetails(address _userID, address _groupID, bytes32 _depositID, address _minipool) public onlyLatestContract("rocketDeposit", msg.sender) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        require(rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", _depositID))), "Deposit does not exist");
        if (_userID != address(0x0)) { require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", _depositID))) == _userID, "Incorrect deposit user ID"); }
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.groupID", _depositID))) == _groupID, "Incorrect deposit group ID");
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool) != -1, "Deposit is not staking under minipool");
    }


}
