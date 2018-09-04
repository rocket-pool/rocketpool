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


    /*** Methods ****************/


    // Create a new deposit
    function create(address _userId, address _groupId, string _stakingDurationId, uint256 _amount) public onlyLatestContract("rocketDepositAPI", msg.sender) {

        // Add deposit
        deposits.push(UserDeposit({
            userId: _userId,
            groupId: _groupId,
            stakingDurationId: _stakingDurationId,
            totalAmount: _amount,
            queuedAmount: _amount,
            stakingAmount: 0,
        }));

    }


    // Check if deposits required to match with a node are available
    function canMatch(string _stakingDurationId, address _nodeContractAddress) public view returns (bool) {
        return matchDeposits(_stakingDurationId, _nodeContractAddress, false);
    }


    // Match deposits with a node by staking duration
    function match(string _stakingDurationId, address _nodeContractAddress) public {

        // Attempt to match deposits; revert if unable
        require(matchDeposits(_stakingDurationId, _nodeContractAddress, true));

    }


    // Match deposits with a node by staking duration
    // Updates deposit queued / staking amounts and node information if _updateDeposits is set
    // Returns a flag indicating whether deposits required to match with node are available
    function matchDeposits(string _stakingDurationId, address _nodeContractAddress, bool _updateDeposits) private returns (bool) {

        // Get settings
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));

        // Chunk size
        uint256 chunkSize = rocketDepositSettings.getDepositChunkSize();

        // Remaining ether amount to match
        uint256 amountToMatch = rocketMinipoolSettings.getMinipoolLaunchAmount().div(2);

        // Check queued deposits
        for (uint di = 0; di < deposits.length; ++di) {

            // Skip non-matching staking IDs & non-queued deposits
            if (deposits[di].stakingDurationId != _stakingDurationId) { continue; }
            if (deposits[di].queuedAmount == 0) { continue; }

            // Get queued deposit amount to match
            uint256 matchAmount = deposits[di].queuedAmount;
            if (matchAmount > chunkSize) { matchAmount = chunkSize; }
            if (matchAmount > amountToMatch) { matchAmount = amountToMatch; }

            // Update remaining amount to match
            amountToMatch = amountToMatch.sub(matchAmount);

            // Update deposit
            if (_updateDeposits) {

                // Update queued / staking ether amounts
                deposits[di].queuedAmount = deposits[di].queuedAmount.sub(matchAmount);
                deposits[di].stakingAmount = deposits[di].stakingAmount.add(matchAmount);

                // Add staking node details
                if (deposits[di].stakingNodeAmounts[_nodeContractAddress] == 0) { deposits[di].stakingNodes.push(_nodeContractAddress); }
                deposits[di].stakingNodeAmounts[_nodeContractAddress] = deposits[di].stakingNodeAmounts[_nodeContractAddress].add(matchAmount);

            }

            // Stop if required amount matched
            if (amountToMatch == 0) { break; }

        }

        // Return amount matched flag
        return (amountToMatch == 0);

    }


}

