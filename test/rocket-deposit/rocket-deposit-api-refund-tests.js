import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositAPI, RocketDepositSettings } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { scenarioDeposit, scenarioRefundQueuedDeposit, scenarioAPIRefundQueuedDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Refunds', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const user1 = accounts[2];
        const user2 = accounts[3];


        // Setup
        let rocketDepositAPI;
        let rocketDepositSettings;
        let groupContract;
        let groupAccessorContract;
        let depositID;
        before(async () => {

            // Get contracts
            rocketDepositAPI = await RocketDepositAPI.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

        });


        // Staker can refund a deposit
        it(printTitle('staker', 'can refund a deposit'), async () => {

            // Make deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Request refund
            await scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user1,
            });

        });


        // Staker cannot refund a deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid staking duration ID'), async () => {

            // Make deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Request refund
            await assertThrows(scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: 'beer',
                depositID,
                fromAddress: user1,
            }), 'Refunded a deposit with an invalid staking duration ID');

        });


        // Staker cannot refund a deposit with an invalid ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid ID'), async () => {
            await assertThrows(scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000000',
                fromAddress: user1,
            }), 'Refunded a deposit with an invalid ID');
        });


        // Staker cannot refund a deposit while refunds are disabled
        it(printTitle('staker', 'cannot refund a deposit while refunds are disabled'), async () => {

            // Disable refunds
            await rocketDepositSettings.setRefundDepositAllowed(false, {from: owner});

            // Request refund
            await assertThrows(scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user1,
            }), 'Refunded a deposit while refunds were disabled');

            // Reenable refunds
            await rocketDepositSettings.setRefundDepositAllowed(true, {from: owner});

        });


        // Staker cannot refund a nonexistant deposit
        it(printTitle('staker', 'cannot refund a nonexistant deposit'), async () => {

            // Nonexistant deposit ID
            await assertThrows(scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                fromAddress: user1,
            }), 'Refunded a nonexistant deposit');

            // Nonexistant user
            await assertThrows(scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user2,
            }), 'Refunded a nonexistant deposit');

        });


        // Staker cannot refund a deposit via deposit API
        it(printTitle('staker', 'cannot refund a deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIRefundQueuedDeposit({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                durationID: '3m',
                depositID,
                fromAddress: user1,
            }), 'Refunded a deposit with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIRefundQueuedDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
            }), 'Refunded a deposit with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIRefundQueuedDeposit({
                groupID: groupContract.address,
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
            }), 'Refunded a deposit directly via RocketDepositAPI');

        });


    });

}
