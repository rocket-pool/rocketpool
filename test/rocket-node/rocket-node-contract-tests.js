import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositSettings, RocketMinipoolSettings, RocketNodeAPI, RocketNodeSettings, RocketPool } from '../_lib/artifacts';
import { userDeposit } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract } from '../_helpers/rocket-node';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioDepositReserve, scenarioDepositReserveCancel, scenarioDeposit, scenarioAPIDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];
        const groupOwner = accounts[2];
        const staker = accounts[3];


        // Setup
        let rocketNodeAPI;
        let rocketNodeSettings;
        let rocketPool;
        let nodeContract;
        let groupContract;
        let groupAccessorContract;
        let minDepositAmount;
        let maxDepositAmount;
        let chunkSize;
        before(async () => {

            // Initialise contracts
            rocketNodeAPI = await RocketNodeAPI.deployed();
            rocketNodeSettings = await RocketNodeSettings.deployed();
            rocketPool = await RocketPool.deployed();

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Get minipool launch & min deposit amounts
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let miniPoolMaxCreateCount = parseInt(await rocketMinipoolSettings.getMinipoolNewMaxAtOnce.call());
            minDepositAmount = Math.floor(miniPoolLaunchAmount / 2);
            maxDepositAmount = (minDepositAmount * miniPoolMaxCreateCount);

            // Get deposit settings
            let rocketDepositSettings = await RocketDepositSettings.deployed();
            chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

        });


        // Random account cannot reserve a deposit
        it(printTitle('random account', 'cannot reserve a deposit'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: accounts[2],
            }), 'Random account reserved a deposit');
        });


        // Node operator cannot reserve a deposit with an invalid staking duration ID
        it(printTitle('node operator', 'cannot reserve a deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: 'beer',
                fromAddress: operator,
            }), 'Reserved a deposit with an invalid staking duration ID');
        });


        // Node operator cannot reserve a deposit with an invalid ether amount
        it(printTitle('node operator', 'cannot reserve a deposit with an invalid ether amount'), async () => {

            // Not a multiple of minipool creation amount
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: Math.floor(minDepositAmount / 2),
                durationID: '3m',
                fromAddress: operator,
            }), 'Reserved a deposit with an invalid ether amount');

            // Over maximum amount
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: (minDepositAmount + maxDepositAmount),
                durationID: '3m',
                fromAddress: operator,
            }), 'Reserved a deposit with an invalid ether amount');

        });


        // Node operator cannot reserve a deposit while deposits are disabled
        it(printTitle('node operator', 'cannot reserve a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner});

            // Reserve deposit
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            }), 'Reserved a deposit while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner});

        });


        // Node operator can reserve a deposit
        it(printTitle('node operator', 'can reserve a deposit'), async () => {
            await scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            });
        });


        // Node operator cannot reserve multiple simultaneous deposits
        it(printTitle('node operator', 'cannot reserve multiple simultaneous deposits'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            }), 'Reserved multiple simultaneous deposits');
        });


        // Random account cannot cancel a deposit reservation
        it(printTitle('random account', 'cannot cancel a deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: accounts[2],
                gas: 5000000,
            }), 'Random account cancelled a deposit reservation');
        });


        // Node operator can cancel a deposit reservation
        it(printTitle('node operator', 'can cancel a deposit reservation'), async () => {
            await scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 5000000,
            });
        });


        // Node operator cannot cancel a nonexistant deposit reservation
        it(printTitle('node operator', 'cannot cancel a nonexistant deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 5000000,
            }), 'Cancelled a nonexistant deposit reservation');
        });


        // Node operator cannot deposit without a reservation
        it(printTitle('node operator', 'cannot deposit without a reservation'), async () => {

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
            }), 'Deposited without a reservation');

            // Reserve deposit
            await scenarioDepositReserve({
                nodeContract,
                amount: maxDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            });

        });


        // Node operator cannot deposit with insufficient ether
        it(printTitle('node operator', 'cannot deposit with insufficient ether'), async () => {
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: Math.floor(maxDepositAmount / 2),
                fromAddress: operator,
            }), 'Deposited with insufficient ether');
        });


        // Node operator cannot deposit while deposits are disabled
        it(printTitle('node operator', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
            }), 'Deposited while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner});

        });


        // Node operator cannot call API deposit method directly
        it(printTitle('node operator', 'cannot call API deposit method directly'), async () => {
            await assertThrows(scenarioAPIDeposit({
                nodeOperator: operator,
            }), 'Called API deposit method directly');
        });


        // Node operator can deposit with no RPL required
        it(printTitle('node operator', 'can deposit with no RPL required'), async () => {

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.equal(rplRequired, 0, 'Pre-check failed: required RPL amount for initial minipools is not 0');

            // Deposit to create initial minipools
            await scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

            // Perform user deposits to assign ether & lower RPL ratio from maximum to 0
            let chunksToAssign = maxDepositAmount / chunkSize;
            for (let di = 0; di <= chunksToAssign; ++di) {

                // Get network utilisation & RPL ratio
                let networkUtilisation = web3.utils.fromWei(await rocketPool.getNetworkUtilisation.call('3m'), 'ether');
                let rplRatio = web3.utils.fromWei(await rocketNodeAPI.getRPLRatio.call('3m'), 'ether');

                // Check RPL ratio based on network utilisation
                switch (networkUtilisation) {
                    case 0.000: assert.isTrue(rplRatio > 4.9 && rplRatio < 5.0, 'Incorrect RPL ratio'); break;
                    case 0.125: assert.isTrue(rplRatio > 1.9 && rplRatio < 2.0, 'Incorrect RPL ratio'); break;
                    case 0.250: assert.isTrue(rplRatio > 1.1 && rplRatio < 1.2, 'Incorrect RPL ratio'); break;
                    case 0.375: assert.isTrue(rplRatio > 1.0 && rplRatio < 1.1, 'Incorrect RPL ratio'); break;
                    case 0.500: assert.isTrue(rplRatio == 1,                    'Incorrect RPL ratio'); break;
                    case 0.625: assert.isTrue(rplRatio > 0.9 && rplRatio < 1.0, 'Incorrect RPL ratio'); break;
                    case 0.750: assert.isTrue(rplRatio > 0.8 && rplRatio < 0.9, 'Incorrect RPL ratio'); break;
                    case 0.875: assert.isTrue(rplRatio > 0.5 && rplRatio < 0.6, 'Incorrect RPL ratio'); break;
                    case 1.000: assert.isTrue(rplRatio == 0,                    'Incorrect RPL ratio'); break;
                }

                // Perform user deposit
                if (di < chunksToAssign) {
                    await userDeposit({
                        depositorContract: groupAccessorContract,
                        durationID: '3m',
                        fromAddress: staker,
                        value: chunkSize,
                    });
                }

            }

            // Make node deposit to create more minipools and raise RPL ratio above 0
            await scenarioDepositReserve({
                nodeContract,
                amount: maxDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            });
            await scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

        });


        // Node operator cannot deposit without depositing required RPL
        it(printTitle('node operator', 'cannot deposit without required RPL'), async () => {

            // Reserve deposit
            await scenarioDepositReserve({
                nodeContract,
                amount: maxDepositAmount,
                durationID: '3m',
                fromAddress: operator,
            });

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.isTrue(rplRequired > 0, 'Pre-check failed: required RPL amount is 0');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
            }), 'Deposited without paying required RPL');

        });


        // Node operator can deposit after depositing required RPL
        it(printTitle('node operator', 'can deposit with required RPL'), async () => {

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.isTrue(rplRequired > 0, 'Pre-check failed: required RPL amount is 0');

            // Deposit required RPL
            await mintRpl({toAddress: nodeContract.address, rplAmount: rplRequired, fromAddress: owner});

            // Deposit
            await scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

        });


    });

};
