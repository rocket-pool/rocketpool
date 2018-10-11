import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketMinipoolSettings, RocketNodeAPI, RocketNodeSettings } from '../_lib/artifacts';
import { createNodeContract } from '../_helpers/rocket-node';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioDepositReserve, scenarioDepositReserveCancel, scenarioDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];


        // Setup
        let rocketNodeAPI;
        let rocketNodeSettings;
        let nodeContract;
        let minDepositAmount;
        let maxDepositAmount;
        before(async () => {

            // Initialise contracts
            rocketNodeAPI = await RocketNodeAPI.deployed();
            rocketNodeSettings = await RocketNodeSettings.deployed();

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});

            // Get minipool launch & min deposit amounts
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let miniPoolMaxCreateCount = parseInt(await rocketMinipoolSettings.getMinipoolNewMaxAtOnce.call());
            minDepositAmount = Math.floor(miniPoolLaunchAmount / 2);
            maxDepositAmount = (minDepositAmount * miniPoolMaxCreateCount);

        });


        // Random account cannot reserve a deposit
        it(printTitle('random account', 'cannot reserve a deposit'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: accounts[2],
                gas: 500000,
            }), 'Random account reserved a deposit');
        });


        // Node operator cannot reserve a deposit with an invalid staking duration ID
        it(printTitle('node operator', 'cannot reserve a deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: 'beer',
                fromAddress: operator,
                gas: 500000,
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
                gas: 500000,
            }), 'Reserved a deposit with an invalid ether amount');

            // Over maximum amount
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: (minDepositAmount + maxDepositAmount),
                durationID: '3m',
                fromAddress: operator,
                gas: 500000,
            }), 'Reserved a deposit with an invalid ether amount');

        });


        // Node operator cannot reserve a deposit while deposits are disabled
        it(printTitle('node operator', 'cannot reserve a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner, gas: 500000});

            // Reserve deposit
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
                gas: 500000,
            }), 'Reserved a deposit while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Node operator can reserve a deposit
        it(printTitle('node operator', 'can reserve a deposit'), async () => {
            await scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
                gas: 500000,
            });
        });


        // Node operator cannot reserve multiple simultaneous deposits
        it(printTitle('node operator', 'cannot reserve multiple simultaneous deposits'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                amount: minDepositAmount,
                durationID: '3m',
                fromAddress: operator,
                gas: 500000,
            }), 'Reserved multiple simultaneous deposits');
        });


        // Random account cannot cancel a deposit reservation
        it(printTitle('random account', 'cannot cancel a deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: accounts[2],
                gas: 500000,
            }), 'Random account cancelled a deposit reservation');
        });


        // Node operator can cancel a deposit reservation
        it(printTitle('node operator', 'can cancel a deposit reservation'), async () => {
            await scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 500000,
            });
        });


        // Node operator cannot cancel a nonexistant deposit reservation
        it(printTitle('node operator', 'cannot cancel a nonexistant deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 500000,
            }), 'Cancelled a nonexistant deposit reservation');
        });


        // Node operator cannot deposit without a reservation
        it(printTitle('node operator', 'cannot deposit without a reservation'), async () => {

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
                gas: 7500000,
            }), 'Deposited without a reservation');

            // Reserve deposit
            await scenarioDepositReserve({
                nodeContract,
                amount: maxDepositAmount,
                durationID: '3m',
                fromAddress: operator,
                gas: 500000,
            });

        });


        // Node operator cannot deposit with insufficient ether
        it(printTitle('node operator', 'cannot deposit with insufficient ether'), async () => {
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: Math.floor(maxDepositAmount / 2),
                fromAddress: operator,
                gas: 7500000,
            }), 'Deposited with insufficient ether');
        });


        // Node operator cannot deposit while deposits are disabled
        it(printTitle('node operator', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
                gas: 7500000,
            }), 'Deposited while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Node operator cannot call API deposit method directly
        it(printTitle('node operator', 'cannot call API deposit method directly'), async () => {
            await assertThrows(rocketNodeAPI.deposit(operator, {
                from: operator,
                gas: 7500000,
            }), 'Called API deposit method directly');
        });


        // Node operator can deposit
        it(printTitle('node operator', 'can deposit'), async () => {
            await scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: accounts[2], // Allowed from any address
                gas: 7500000,
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
                gas: 500000,
            });

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: maxDepositAmount,
                fromAddress: operator,
                gas: 7500000,
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
                gas: 7500000,
            });

        });


    });

};
