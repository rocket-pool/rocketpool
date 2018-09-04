pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../../lib/SafeMath.sol";


/// @title RocketDeposit - manages deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDeposit is RocketBase {


    /*** Libs  **************/


    using SafeMath for uint256;


    /*** Contracts **************/


    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);


    /*** Structs ****************/


    struct UserDeposit {
        address userId;
        address groupId;
        string stakingDurationId;
        uint256 totalAmount;
        uint256 queuedAmount;
        uint256 stakingAmount;
        address[] stakingPools;
        mapping(address => uint256) stakingPoolAmounts;
    }


    /*** Properties *************/


    // Deposits
    UserDeposit[] private deposits;

    // Deposit queue balances by staking duration
    mapping(string => uint256) private stakingQueueBalances;


    /*** Methods ****************/


    // Create a new deposit
    function create(address _userID, address _groupID, string _stakingDurationID, uint256 _amount) public onlyLatestContract("rocketDepositAPI", msg.sender) {

        // Get settings
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Add deposit
        deposits.push(UserDeposit({
            userId: _userID,
            groupId: _groupID,
            stakingDurationId: _stakingDurationID,
            totalAmount: _amount,
            queuedAmount: _amount,
            stakingAmount: 0,
        }));

        // Update queue balance
        stakingQueueBalances[_stakingDurationID] = stakingQueueBalances[_stakingDurationID].add(_amount);

        // Deposit settings
        uint256 chunkSize = rocketDepositSettings.getDepositChunkSize();
        uint256 maxChunkAssignments = rocketDepositSettings.getChunkAssignMax();

        // Assign chunks while able
        uint256 chunkAssignments = 0;
        while (stakingQueueBalances[_stakingDurationID] >= chunkSize && chunkAssignments++ < maxChunkAssignments) {
            assignChunk();
        }

    }


    // Assign chunk
    function assignChunk(string _stakingDurationID) private {

        // Get settings
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Remaining ether amount to match
        uint256 chunkSize = rocketDepositSettings.getDepositChunkSize();
        uint256 amountToMatch = chunkSize;

        // Get random node to assign chunk to
        // TODO: implement
        address nodeContractAddress = 0x0;

        // Check queued deposits
        // Max number of iterations is (DepositChunkSize / DepositMin) + 1
        for (uint256 di = 0; di < deposits.length; ++di) {

            // Skip non-matching staking IDs & non-queued deposits
            if (deposits[di].stakingDurationId != _stakingDurationID) { continue; }
            if (deposits[di].queuedAmount == 0) { continue; }

            // Get queued deposit ether amount to match
            uint256 matchAmount = deposits[di].queuedAmount;
            if (matchAmount > amountToMatch) { matchAmount = amountToMatch; }

            // Update remaining ether amount to match
            amountToMatch = amountToMatch.sub(matchAmount);

            // Update deposit queued / staking ether amounts
            deposits[di].queuedAmount = deposits[di].queuedAmount.sub(matchAmount);
            deposits[di].stakingAmount = deposits[di].stakingAmount.add(matchAmount);

            // Add staking node details
            if (deposits[di].stakingNodeAmounts[nodeContractAddress] == 0) { deposits[di].stakingNodes.push(nodeContractAddress); }
            deposits[di].stakingNodeAmounts[nodeContractAddress] = deposits[di].stakingNodeAmounts[nodeContractAddress].add(matchAmount);

            // Stop if required ether amount matched
            if (amountToMatch == 0) { break; }

        }

        // Update queue balance
        stakingQueueBalances[_stakingDurationID] = stakingQueueBalances[_stakingDurationID].sub(chunkSize);

        // Transfer balance to node contract
        // TODO: implement

    }


}

