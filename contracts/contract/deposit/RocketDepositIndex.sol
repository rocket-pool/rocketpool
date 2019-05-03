pragma solidity 0.5.8;


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


    /*** Constructor ************/


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Getters ****************/


    /// @dev Get the number of deposits a user has made
    function getUserDepositCount(address _groupID, address _userID, string memory _durationID) public returns (uint256) {
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        return bytes32SetStorage.getCount(keccak256(abi.encodePacked("user.deposits", _userID, _groupID, _durationID)));
    }


    /// @dev Get a user's deposit ID by index
    function getUserDepositAt(address _groupID, address _userID, string memory _durationID, uint256 _index) public returns (bytes32) {
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        return bytes32SetStorage.getItem(keccak256(abi.encodePacked("user.deposits", _userID, _groupID, _durationID)), _index);
    }


    /// @dev Get the number of queued deposits a user has
    function getUserQueuedDepositCount(address _groupID, address _userID, string memory _durationID) public returns (uint256) {
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        return bytes32SetStorage.getCount(keccak256(abi.encodePacked("user.deposits.queued", _userID, _groupID, _durationID)));
    }


    /// @dev Get a user's queued deposit ID by index
    function getUserQueuedDepositAt(address _groupID, address _userID, string memory _durationID, uint256 _index) public returns (bytes32) {
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        return bytes32SetStorage.getItem(keccak256(abi.encodePacked("user.deposits.queued", _userID, _groupID, _durationID)), _index);
    }


    /// @dev Get the total amount of a user deposit
    function getUserDepositTotalAmount(bytes32 _depositID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.totalAmount", _depositID)));
    }


    /// @dev Get the queued amount of a user deposit
    function getUserDepositQueuedAmount(bytes32 _depositID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)));
    }


    /// @dev Get the staking amount of a user deposit
    function getUserDepositStakingAmount(bytes32 _depositID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)));
    }


    /// @dev Get the refunded amount of a user deposit
    function getUserDepositRefundedAmount(bytes32 _depositID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)));
    }


    /// @dev Get the withdrawn amount of a user deposit
    function getUserDepositWithdrawnAmount(bytes32 _depositID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.withdrawnAmount", _depositID)));
    }


    /// @dev Get the number of minipools a user deposit is staking under
    function getUserDepositStakingPoolCount(bytes32 _depositID) public returns (uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)));
    }


    /// @dev Get the address of a minipool a user deposit is staking under by index
    function getUserDepositStakingPoolAt(bytes32 _depositID, uint256 _index) public returns (address) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _index);
    }


    /// @dev Get the amount of a user deposit staking under a minipool
    function getUserDepositStakingPoolAmount(bytes32 _depositID, address _minipool) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)));
    }


    /*** Methods ****************/


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
        // + deposit.stakingAmount
        // + deposit.stakingPools
        // + deposit.stakingPoolAmount
        // + deposit.refundedAmount
        // + deposit.withdrawnAmount

        // Update deposit indexes
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32SetStorage.addItem(keccak256(abi.encodePacked("user.deposits", _userID, _groupID, _durationID)), depositID);
        // + user.deposits.queued

        // Return ID
        return depositID;

    }


    // Handle assignment of a deposit fragment to a minipool
    function assign(bytes32 _depositID, address _minipool, uint256 _assignAmount) public onlyLatestContract("rocketDepositQueue", msg.sender) {

        // Decrease queued amount
        uint256 queuedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)), queuedAmount.sub(_assignAmount));

        // Increase staking amount
        uint256 stakingAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingAmount", _depositID)), stakingAmount.add(_assignAmount));

        // Add staking pool if user is joining pool
        uint256 stakingPoolAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)));
        if (stakingPoolAmount == 0) {
            addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
            addressSetStorage.addItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool);
        }

        // Increase staking pool amount
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), stakingPoolAmount.add(_assignAmount));

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


}
