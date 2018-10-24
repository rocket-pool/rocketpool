import { printTitle, assertThrows } from '../_lib/utils/general';
import { DummyBeaconChain } from '../_lib/utils/beacon';
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
        const user3 = accounts[5];


        // Setup
        let beaconChain;
        let rocketDepositAPI;
        let rocketDepositSettings;
        let rocketMinipoolSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        let depositID;
        before(async () => {

            // Initialise dummy beacon chain
            beaconChain = new DummyBeaconChain(web3);
            await beaconChain.init();

            // Get contracts
            rocketDepositAPI = await RocketDepositAPI.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

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
                    beaconChain,
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: selfAssignableDepositSize + parseInt(web3.utils.toWei('0.01', 'ether')),
                    gas: 7500000,
                });
            }

            // Make minimum deposits
            for (let di = 0; di < maxMinDepositsPerAssignTx; ++di) {
                await scenarioDeposit({
                    beaconChain,
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: minDepositSize,
                    gas: 7500000,
                });
            }

            // Create minipools to assign minimum deposits to
            await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: minipoolsPerAssignTx, nodeOperator, owner});

            // Make final deposits to process queue and fill minipool
            for (let di = 0; di < selfAssignableDepositsPerMinipool - 1; ++di) {
                await scenarioDeposit({
                    beaconChain,
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: selfAssignableDepositSize,
                    gas: 7500000,
                });
            }

        });


        // Staker can only deposit up to the current maximum deposit size
        it(printTitle('staker', 'can only deposit up to the current maximum deposit size'), async () => {

            // Get deposit settings
            let maxQueueSize = parseInt(await rocketDepositSettings.getDepositQueueSizeMax.call());
            let maxDepositSizeLimit = parseInt(await rocketDepositSettings.getDepositMax.call());
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
            let chunksPerDepositTx = parseInt(await rocketDepositSettings.getChunkAssignMax.call());
            let maxDepositSize;

            // Check current max deposit size is equal to maximum limit
            maxDepositSize = parseInt(await rocketDepositSettings.getCurrentDepositMax.call('3m'));
            assert.equal(maxDepositSize, maxDepositSizeLimit, 'Pre-check failed: current max deposit size is not the maximum limit');

            // Make deposit to fill queue
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxQueueSize,
                gas: 7500000,
            });

            // Get ID of deposit made to fill queue
            let depositCount = parseInt(await rocketDepositAPI.getUserQueuedDepositCount.call(groupContract.address, user2, '3m'));
            let fillQueueDepositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', depositCount - 1);

            // Check current max deposit size is equal to locked limit
            maxDepositSize = parseInt(await rocketDepositSettings.getCurrentDepositMax.call('3m'));
            assert.equal(maxDepositSize, 0, 'Pre-check failed: current max deposit size is not the "locked" limit');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: web3.utils.toWei('1', 'ether'),
                gas: 7500000,
            }), 'Deposited while the deposit queue was locked');

            // Create minipool to allow deposits up to "backlog" limit
            await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator, owner});

            // Check current max deposit size is equal to backlog limit
            maxDepositSize = parseInt(await rocketDepositSettings.getCurrentDepositMax.call('3m'));
            assert.equal(maxDepositSize, chunkSize * (chunksPerDepositTx - 1), 'Pre-check failed: current max deposit size is not the "backlog" limit');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize + parseInt(web3.utils.toWei('1', 'ether')),
                gas: 7500000,
            }), 'Deposited an amount over the current maximum deposit size');

            // Make deposit
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: maxDepositSize,
                gas: 7500000,
            });

            // Refund deposit made to fill queue
            await scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                groupID: groupContract.address,
                durationID: '3m',
                depositID: fillQueueDepositID,
                fromAddress: user2,
                gas: 500000,
            });

        });


        // Staker cannot deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDeposit({
                beaconChain,
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
                beaconChain,
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
                beaconChain,
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
                beaconChain,
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
                beaconChain,
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
                fromAddress: user3,
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
