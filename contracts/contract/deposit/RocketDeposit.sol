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
        address[] stakingNodes;
        mapping(address => uint256) stakingNodeAmounts;
    }


    /*** Properties *************/


    // Deposits
    UserDeposit[] private deposits;

    // Deposit queue balances by staking duration
    mapping(string => uint256) private stakingQueueBalances;


    /*** Methods ****************/


    // Create a new deposit
    function create(address _userId, address _groupId, string _stakingDurationId, uint256 _amount) public onlyLatestContract("rocketDepositAPI", msg.sender) {

        // Get settings
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Add deposit
        deposits.push(UserDeposit({
            userId: _userId,
            groupId: _groupId,
            stakingDurationId: _stakingDurationId,
            totalAmount: _amount,
            queuedAmount: _amount,
            stakingAmount: 0,
        }));

        // Update queue balance
        stakingQueueBalances[_stakingDurationId] = stakingQueueBalances[_stakingDurationId].add(_amount);

        // Assign chunks if able
        uint maxChunkAssignments = rocketDepositSettings.getChunkAssignMax();
        uint chunkAssignments = 0;
        while (canAssignChunk() && chunkAssignments++ < maxChunkAssignments) {
            assignChunk();
        }

    }


    // Check if the deposit contract balance is high enough to assign a chunk
    function canAssignChunk(string _stakingDurationId) private view returns (bool) {
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        return (stakingQueueBalances[_stakingDurationId] >= rocketDepositSettings.getDepositChunkSize());
    }


    // Assign chunk
    function assignChunk(string _stakingDurationId) private {

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
        for (uint di = 0; di < deposits.length; ++di) {

            // Skip non-matching staking IDs & non-queued deposits
            if (deposits[di].stakingDurationId != _stakingDurationId) { continue; }
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
        stakingQueueBalances[_stakingDurationId] = stakingQueueBalances[_stakingDurationId].sub(chunkSize);

        // Transfer balance to node contract
        // TODO: implement

    }


}

