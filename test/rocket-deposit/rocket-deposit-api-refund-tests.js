import { printTitle, assertThrows } from '../_lib/utils/general';
import { DummyBeaconChain } from '../_lib/utils/beacon';
import { RocketDepositAPI, RocketDepositSettings } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { scenarioDeposit, scenarioRefundDeposit, scenarioAPIRefundDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Refunds', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const user1 = accounts[2];
        const user2 = accounts[3];


        // Setup
        let beaconChain;
        let rocketDepositAPI;
        let rocketDepositSettings;
        let groupContract;
        let groupAccessorContract;
        let depositID;
        before(async () => {

            // Initialise dummy beacon chain
            beaconChain = new DummyBeaconChain(web3);
            await beaconChain.init();

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
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
                gas: 7500000,
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Request refund
            await scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            });

        });


        // Staker cannot refund a deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid staking duration ID'), async () => {

            // Make deposit
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
                gas: 7500000,
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Request refund
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: 'beer',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid staking duration ID');

        });


        // Staker cannot refund a deposit with an invalid ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid ID'), async () => {
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000000',
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid ID');
        });


        // Staker cannot refund a deposit while refunds are disabled
        it(printTitle('staker', 'cannot refund a deposit while refunds are disabled'), async () => {

            // Disable refunds
            await rocketDepositSettings.setRefundDepositAllowed(false, {from: owner, gas: 500000});

            // Request refund
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit while refunds were disabled');

            // Reenable refunds
            await rocketDepositSettings.setRefundDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot refund a nonexistant deposit
        it(printTitle('staker', 'cannot refund a nonexistant deposit'), async () => {

            // Nonexistant deposit ID
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a nonexistant deposit');

            // Nonexistant user
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID,
                fromAddress: user2,
                gas: 500000,
            }), 'Refunded a nonexistant deposit');

        });


        // Staker cannot refund a deposit via deposit API
        it(printTitle('staker', 'cannot refund a deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: groupContract.address,
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit directly via RocketDepositAPI');

        });


    });

}
