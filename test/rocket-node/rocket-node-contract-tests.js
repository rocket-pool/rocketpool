import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketMinipoolSettings, RocketNodeAPI, RocketNodeContract, RocketNodeSettings } from '../_lib/artifacts';
import { scenarioDepositReserve, scenarioDepositReserveCancel } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];


        // Setup
        let rocketNodeSettings;
        let nodeContract;
        let minDepositAmount;
        let maxDepositAmount;
        before(async () => {

            // Initialise node settings
            rocketNodeSettings = await RocketNodeSettings.deployed();

            // Create node contract
            let rocketNodeAPI = await RocketNodeAPI.deployed();
            let result = await rocketNodeAPI.add('Australia/Brisbane', {from: operator, gas: 7500000});

            // Get node contract instance
            let nodeContractAddress = result.logs[0].args.contractAddress;
            nodeContract = await RocketNodeContract.at(nodeContractAddress);

            // Get minipool launch & min deposit amounts
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let miniPoolMaxLaunchCount = parseInt(await rocketMinipoolSettings.getMinipoolNewMaxAtOnce.call());
            minDepositAmount = Math.floor(miniPoolLaunchAmount / 2);
            maxDepositAmount = (minDepositAmount * miniPoolMaxLaunchCount);

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


    });

};
