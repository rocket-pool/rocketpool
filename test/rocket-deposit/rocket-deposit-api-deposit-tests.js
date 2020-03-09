import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositIndex, RocketDepositQueue, RocketDepositSettings, RocketMinipoolSettings, RocketNode } from '../_lib/artifacts';
import { setRocketPoolWithdrawalKey } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { scenarioDeposit, scenarioRefundQueuedDeposit, scenarioRocketpoolEtherDeposit, scenarioAPIDeposit, scenarioProcessDepositQueue } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Deposits', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];
        const withdrawalKeyOperator = accounts[5];


        // Setup
        let rocketDepositIndex;
        let rocketDepositSettings;
        let rocketDepositQueue;
        let rocketMinipoolSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        before(async () => {

            // Set Rocket Pool withdrawal key
            await setRocketPoolWithdrawalKey({nodeOperator: withdrawalKeyOperator, owner});

            // Get contracts
            rocketDepositIndex = await RocketDepositIndex.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            rocketDepositQueue = await RocketDepositQueue.deployed();

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

        });


        // Staker can deposit via group depositor
        it(printTitle('staker', 'can deposit via group depositor'), async () => {

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
            let minDepositSize = parseInt(await rocketDepositSettings.getDepositMin.call());
            let chunksPerDepositTx = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

            // Get minipool settings
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let miniPoolAssignAmount = Math.floor(miniPoolLaunchAmount / 2);

            // Parameters to fill initial minipool and leave change in deposit queue
            let selfAssignableDepositSize = chunkSize * chunksPerDepositTx;
            let selfAssignableDepositsPerMinipool = Math.floor(miniPoolAssignAmount / selfAssignableDepositSize);

            // Parameters to set up maximum number of minimum deposits to be processed in one tx
            let maxMinDepositsPerAssignTx = Math.ceil(chunkSize / minDepositSize) * chunksPerDepositTx;
            let minipoolsPerAssignTx = Math.ceil(selfAssignableDepositSize / miniPoolAssignAmount);

            // Create single minipool to fill
            await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator, owner});

            // Fill minipool and leave change from last deposit in queue
            for (let di = 0; di < selfAssignableDepositsPerMinipool; ++di) {
                await scenarioDeposit({
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: selfAssignableDepositSize + parseInt(web3.utils.toWei('0.01', 'ether')),
                });
            }

            // Make minimum deposits
            for (let di = 0; di < maxMinDepositsPerAssignTx; ++di) {
                await scenarioDeposit({
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: minDepositSize,
                });
            }

            // Create minipools to assign minimum deposits to
            await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: minipoolsPerAssignTx, nodeOperator, owner});

            // Make final deposits to process queue and fill minipool
            for (let di = 0; di < selfAssignableDepositsPerMinipool - 1; ++di) {
                await scenarioDeposit({
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: selfAssignableDepositSize - parseInt(web3.utils.toWei('0.01', 'ether')),
                });
            }

            // Fill remaining minipool capacity
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: selfAssignableDepositSize - parseInt(web3.utils.toWei('0.01', 'ether')),
            });

        });


        // Staker can only deposit up to the current maximum deposit size
        it(printTitle('staker', 'can only deposit up to the current maximum deposit size'), async () => {

            // Get deposit settings
            let maxQueueSize = parseInt(await rocketDepositSettings.getDepositQueueSizeMax.call());
            let maxDepositSizeLimit = parseInt(await rocketDepositSettings.getDepositMax.call());
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
            let chunksPerDepositTx = parseInt(await rocketDepositSettings.getChunkAssignMax.call());
            let maxDepositSize;

            // Check current max deposit size
            maxDepositSize = await rocketDepositSettings.getCurrentDepositMax.call('3m');
            assert.equal(parseInt(maxDepositSize), maxDepositSizeLimit, 'Pre-check failed: current max deposit size is not the maximum limit');

            // Make deposit to fill queue 62.5%
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize,
            });

            // Check current max deposit size
            let queueBalance = parseInt(await rocketDepositQueue.getBalance.call('3m'));
            maxDepositSize = await rocketDepositSettings.getCurrentDepositMax.call('3m');
            assert.equal(parseInt(maxDepositSize), maxQueueSize - queueBalance, 'Pre-check failed: current max deposit size is not the remaining queue capacity');

            // Make deposit to fill queue 100%
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize,
            });

            // Get IDs of deposits made to fill queue
            let depositCount = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupContract.address, user2, '3m'));
            let fillQueueDepositID1 = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', depositCount - 1);
            let fillQueueDepositID2 = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', depositCount - 2);

            // Check current max deposit size is equal to locked limit
            maxDepositSize = parseInt(await rocketDepositSettings.getCurrentDepositMax.call('3m'));
            assert.equal(maxDepositSize, 0, 'Pre-check failed: current max deposit size is not the "locked" limit');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: web3.utils.toWei('1', 'ether'),
            }), 'Deposited while the deposit queue was locked');

            // Create minipool to allow deposits up to "backlog" limit
            await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator, owner});

            // Check current max deposit size is equal to backlog limit
            maxDepositSize = parseInt(await rocketDepositSettings.getCurrentDepositMax.call('3m'));
            assert.equal(maxDepositSize, chunkSize * (chunksPerDepositTx - 1), 'Pre-check failed: current max deposit size is not the "backlog" limit');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize + parseInt(web3.utils.toWei('1', 'ether')),
            }), 'Deposited an amount over the current maximum deposit size');

            // Make deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize,
            });

            // Refund deposits made to fill queue
            await scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: fillQueueDepositID1,
                fromAddress: user2,
            });
            await scenarioRefundQueuedDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: fillQueueDepositID2,
                fromAddress: user2,
            });

        });


        // Staker cannot deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: 'beer',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited with an invalid staking duration ID');
        });


        // Staker cannot deposit while deposits are disabled
        it(printTitle('staker', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketDepositSettings.setDepositAllowed(false, {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited while deposits were disabled');

            // Reenable deposits
            await rocketDepositSettings.setDepositAllowed(true, {from: owner});

        });


        // Staker cannot deposit under the minimum deposit amount
        it(printTitle('staker', 'cannot deposit under the minimum deposit amount'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('1000', 'ether'), {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited under the minimum deposit amount');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner});

        });


        // Staker cannot deposit over the maximum deposit amount
        it(printTitle('staker', 'cannot deposit over the maximum deposit amount'), async () => {

            // Set maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('0.5', 'ether'), {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited over the maximum deposit amount');

            // Reset maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('1000', 'ether'), {from: owner});

        });


        // Staker cannot make empty deposit
        it(printTitle('staker', 'cannot make empty deposit'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0', 'ether'), {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: 0,
            }), 'Made an empty deposit');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner});

        });


        // Staker cannot deposit via rocketpoolEtherDeposit method
        it(printTitle('staker', 'cannot deposit via rocketpoolEtherDeposit method'), async () => {
            await assertThrows(scenarioRocketpoolEtherDeposit({
                depositorContract: groupAccessorContract,
                fromAddress: user1,
                value: web3.utils.toWei('1', 'ether'),
            }), 'Deposited via rocketpoolEtherDeposit method');
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
            }), 'Deposited with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContract.address,
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
            }), 'Deposited directly via RocketDepositAPI');

        });


        // Random account can process the deposit queue
        it(printTitle('random account', 'can process the deposit queue'), async () => {

            // Check queue status
            let rocketNode = await RocketNode.deployed();
            let queueBalance = parseInt(await rocketDepositQueue.getBalance.call('3m'));
            let availableNodeCount = parseInt(await rocketNode.getAvailableNodeCount.call('3m'));
            assert.isTrue(queueBalance > 0, 'Pre-check failed: deposit queue is empty');
            assert.isTrue(availableNodeCount > 0, 'Pre-check failed: no nodes available for assignment');

            // Process queue
            await scenarioProcessDepositQueue({
                durationID: '3m',
                fromAddress: accounts[9],
            });

            // Check queue status
            queueBalance = parseInt(await rocketDepositQueue.getBalance.call('3m'));
            assert.equal(queueBalance,  0, 'Pre-check failed: deposit queue is not empty');

            // Process queue
            await scenarioProcessDepositQueue({
                durationID: '3m',
                fromAddress: accounts[9],
            });

        });


        // Random account cannot process the deposit queue with an invalid staking duration
        it(printTitle('random account', 'cannot process the deposit queue with an invalid staking duration'), async () => {
            await assertThrows(scenarioProcessDepositQueue({
                durationID: 'beer',
                fromAddress: accounts[9],
            }), 'Processed the deposit queue with an invalid staking duration');
        });


    });

}
