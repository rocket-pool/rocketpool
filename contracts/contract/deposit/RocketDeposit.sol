pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/utils/lists/AddressListStorageInterface.sol";
import "../../interface/utils/lists/Bytes32ListStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDeposit - manages deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDeposit is RocketBase {


    /*** Libs  **************/


    using SafeMath for uint256;


    /*** Contracts **************/


    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    AddressListStorageInterface addressListStorage = AddressListStorageInterface(0);
    Bytes32ListStorageInterface bytes32ListStorage = Bytes32ListStorageInterface(0);


    /*** Methods ****************/


    // Create a new deposit
    function create(address _userID, address _groupID, string _stakingDurationID, uint256 _amount) public onlyLatestContract("rocketDepositAPI", msg.sender) {

        // Get contracts
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Add deposit
        add(_userID, _groupID, _stakingDurationID, _amount);

        // Update queue balance
        uint256 queueBalance = rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _stakingDurationID))).add(_amount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposits.queue.balance", _stakingDurationID)), queueBalance);

        // Deposit settings
        uint256 chunkSize = 4 ether; //rocketDepositSettings.getDepositChunkSize();
        uint256 maxChunkAssignments = 1; //rocketDepositSettings.getChunkAssignMax();

        // Assign chunks while able
        uint256 chunkAssignments = 0;
        while (
            rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _stakingDurationID))) >= chunkSize && // Duration queue balance high enough to assign chunk
            chunkAssignments++ < maxChunkAssignments // Only assign up to maximum number of chunks
        ) {
            assignChunk(_stakingDurationID);
        }

    }


    // Assign chunk
    function assignChunk(string _stakingDurationID) private {

        // Get contracts
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        addressListStorage = AddressListStorageInterface(getContractAddress("addressListStorage"));
        bytes32ListStorage = Bytes32ListStorageInterface(getContractAddress("bytes32ListStorage"));

        // Remaining ether amount to match
        uint256 chunkSize = 4 ether; //rocketDepositSettings.getDepositChunkSize();
        uint256 amountToMatch = chunkSize;

        // Get random node's pool to assign chunk to
        // TODO: implement
        address poolContractAddress = 0x0;

        // Check queued deposits
        // Max number of iterations is (DepositChunkSize / DepositMin) + 1
        for (uint256 di = 0; di < bytes32ListStorage.getListCount(keccak256(abi.encodePacked("deposits.queue", _stakingDurationID))); ++di) {

            // Get deposit details
            bytes32 depositID = bytes32ListStorage.getListItem(keccak256(abi.encodePacked("deposits.queue", _stakingDurationID)), di);
            uint256 queuedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)));
            uint256 stakingAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", depositID)));

            // Get queued deposit ether amount to match
            uint256 matchAmount = queuedAmount;
            if (matchAmount > amountToMatch) { matchAmount = amountToMatch; }

            // Update remaining ether amount to match
            amountToMatch = amountToMatch.sub(matchAmount);

            // Update deposit queued / staking ether amounts
            queuedAmount = queuedAmount.sub(matchAmount);
            stakingAmount = stakingAmount.add(matchAmount);
            rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)), queuedAmount);
            rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingAmount", depositID)), stakingAmount);

            // Add deposit staking pool details
            uint256 stakingPoolAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", depositID, poolContractAddress)));
            if (stakingPoolAmount == 0) { addressListStorage.pushListItem(keccak256(abi.encodePacked("deposit.stakingPools", depositID)), poolContractAddress); }
            rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", depositID, poolContractAddress)), stakingPoolAmount.add(matchAmount));

            // Remove deposit from queue if queued amount depleted
            // TODO: implement; fix deposit queue structure to meet criteria:
            //   - deposits must be processed in FIFO order
            //   - removing a deposit from the queue must not be computationally expensive
            //   - removing a deposit from the queue must not alter the queue order
            if (queuedAmount == 0) {  }

            // Stop if required ether amount matched
            if (amountToMatch == 0) { break; }

        }

        // Update queue balance
        uint256 queueBalance = rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _stakingDurationID))).sub(chunkSize);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposits.queue.balance", _stakingDurationID)), queueBalance);

        // Transfer balance to node contract
        // TODO: implement

    }


    // Add a deposit
    // Returns the new deposit ID
    function add(address _userID, address _groupID, string _stakingDurationID, uint256 _amount) private returns (bytes32) {

        // Get contracts
        bytes32ListStorage = Bytes32ListStorageInterface(getContractAddress("bytes32ListStorage"));

        // Get deposit ID
        bytes32 depositID = keccak256(abi.encodePacked("deposit", _userID, _groupID, _stakingDurationID, _amount, now));
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", depositID))), "Deposit ID already in use");

        // Set deposit details
        rocketStorage.setBool(keccak256(abi.encodePacked("deposit.exists", depositID)), true);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.userID", depositID)), _userID);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.groupID", depositID)), _groupID);
        rocketStorage.setString(keccak256(abi.encodePacked("deposit.stakingDurationID", depositID)), _stakingDurationID);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.totalAmount", depositID)), _amount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)), _amount);
        // + stakingAmount
        // + stakingPools
        // + stakingPoolAmount

        // Update deposit indexes
        bytes32ListStorage.pushListItem(keccak256(abi.encodePacked("deposits.queue", _stakingDurationID)), depositID);

        // Return ID
        return depositID;

    }


}

