import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositAPI, RocketDepositSettings, RocketMinipoolSettings } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { scenarioDeposit, scenarioRefundDeposit, scenarioAPIDeposit, scenarioAPIRefundDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];


        // Setup
        let rocketDepositAPI;
        let rocketDepositSettings;
        let minDepositSize;
        let numMinDeposits;
        let initialDepositSize;
        let groupContract;
        let groupAccessorContract;
        before(async () => {


            //
            // Deposit
            //

            // Get deposit contracts
            rocketDepositAPI =  await RocketDepositAPI.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
            minDepositSize = parseInt(await rocketDepositSettings.getDepositMin.call());
            let chunksPerDeposit = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

            // Get deposit scenario parameters
            numMinDeposits = Math.ceil(chunkSize / minDepositSize) * chunksPerDeposit;
            initialDepositSize = chunkSize * chunksPerDeposit * numMinDeposits;
            let minDepositsTotalSize = numMinDeposits * minDepositSize;


            //
            // Group
            //

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});


            //
            // Node
            //

            // Create node contract
            let nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

            // Get node deposit amount
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());

            // Get deposit scenario parameters
            let minipoolsRequired = Math.ceil((initialDepositSize + minDepositsTotalSize) / Math.floor(miniPoolLaunchAmount / 2)) + 1;

            // Create minipools
            await createNodeMinipools({
                nodeContract,
                stakingDurationID: '3m',
                minipoolCount: minipoolsRequired,
                nodeOperator,
                owner
            });


        });


        // Staker can deposit via group depositor
        it(printTitle('staker', 'can deposit via group depositor'), async () => {

            // Make initial large deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: initialDepositSize + 1,
                gas: 7500000,
            });

            // Make minimum deposits
            for (let di = 0; di < numMinDeposits + 1; ++di) {
                await scenarioDeposit({
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: minDepositSize,
                    gas: 7500000,
                });
            }

        });


        // TODO:
        // - add tests for dynamic maximum deposit size
        // - test deposits while queue is full and minipools are available (succeed if under current deposit maximum)
        // - test deposits while queue is full and minipools are unavailable (fail only)


        // Staker cannot deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: 'beer',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid staking duration ID');
        });


        // Staker cannot deposit while deposits are disabled
        it(printTitle('staker', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketDepositSettings.setDepositAllowed(false, {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited while deposits were disabled');

            // Reenable deposits
            await rocketDepositSettings.setDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot deposit under the minimum deposit amount
        it(printTitle('staker', 'cannot deposit under the minimum deposit amount'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('1000', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited under the minimum deposit amount');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot deposit over the maximum deposit amount
        it(printTitle('staker', 'cannot deposit over the maximum deposit amount'), async () => {

            // Set maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited over the maximum deposit amount');

            // Reset maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('1000', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot make empty deposit
        it(printTitle('staker', 'cannot make empty deposit'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: 0,
                gas: 7500000,
            }), 'Made an empty deposit');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot deposit via deposit API
        it(printTitle('staker', 'cannot deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContract.address,
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited directly via RocketDepositAPI');

        });


        // Deposit ID for refunds
        let depositID;


        // Staker can refund a deposit
        it(printTitle('staker', 'can refund a deposit'), async () => {

            // Make deposit
            await scenarioDeposit({
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
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a nonexistant deposit');

            // Nonexistant user
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
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
