import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketMinipoolSettings } from '../_lib/artifacts';
import { scenarioAddStakingDuration, scenarioSetStakingDurationEpochs, scenarioSetStakingDurationEnabled } from './rocket-minipool-settings-scenarios';

export default function() {

    contract('RocketMinipoolSettings', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const user = accounts[1];


        // Deployed contracts
        let rocketMinipoolSettings;
        before(async () => {
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
        });


        // Owner can add a staking duration
        it(printTitle('owner', 'can add a staking duration'), async () => {
            await scenarioAddStakingDuration({
                durationId: '1d',
                epochs: 10,
                fromAddress: owner,
                gas: 8000000,
            });
        });


        // Owner cannot add a staking duration which already exists
        it(printTitle('owner', 'cannot add a staking duration which already exists'), async () => {
            await assertThrows(scenarioAddStakingDuration({
                durationId: '1d',
                epochs: 10,
                fromAddress: owner,
                gas: 8000000,
            }), 'Added a staking duration which already exists');
        });


        // Owner cannot add a staking duration with zero epochs
        it(printTitle('owner', 'cannot add a staking duration with zero epochs'), async () => {
            await assertThrows(scenarioAddStakingDuration({
                durationId: '2d',
                epochs: 0,
                fromAddress: owner,
                gas: 8000000,
            }), 'Added a staking duration with zero epochs');
        });


        // Random account cannot add a staking duration
        it(printTitle('random account', 'cannot add a staking duration'), async () => {
            await assertThrows(scenarioAddStakingDuration({
                durationId: '2d',
                epochs: 20,
                fromAddress: user,
                gas: 8000000,
            }), 'Random account added a staking duration');
        });


        // Owner can set staking duration epochs
        it(printTitle('owner', 'can set staking duration epochs'), async () => {
            await scenarioSetStakingDurationEpochs({
                durationId: '1d',
                epochs: 15,
                fromAddress: owner,
                gas: 8000000,
            });
        });


        // Owner cannot set epochs for a nonexistent staking duration
        it(printTitle('owner', 'cannot set epochs for a nonexistent staking duration'), async () => {
            await assertThrows(scenarioSetStakingDurationEpochs({
                durationId: '2d',
                epochs: 25,
                fromAddress: owner,
                gas: 8000000,
            }), 'Set epochs for a nonexistent staking duration');
        });


        // Owner cannot set staking duration epochs to its current value
        it(printTitle('owner', 'cannot set staking duration epochs to its current value'), async () => {
            await assertThrows(scenarioSetStakingDurationEpochs({
                durationId: '1d',
                epochs: 15,
                fromAddress: owner,
                gas: 8000000,
            }), 'Set staking duration epochs to its current value');
        });


        // Owner cannot set staking duration epochs to zero
        it(printTitle('owner', 'cannot set staking duration epochs to zero'), async () => {
            await assertThrows(scenarioSetStakingDurationEpochs({
                durationId: '1d',
                epochs: 0,
                fromAddress: owner,
                gas: 8000000,
            }), 'Set staking duration epochs to zero');
        });


        // Random account cannot set staking duration epochs
        it(printTitle('random account', 'cannot set staking duration epochs'), async () => {
            await assertThrows(scenarioSetStakingDurationEpochs({
                durationId: '1d',
                epochs: 25,
                fromAddress: user,
                gas: 8000000,
            }), 'Random account set staking duration epochs');
        });


        // Owner can set staking duration enabled status
        it(printTitle('owner', 'can set staking duration enabled status'), async () => {
            await scenarioSetStakingDurationEnabled({
                durationId: '1d',
                enabled: false,
                fromAddress: owner,
                gas: 8000000,
            });
        });


        // Owner cannot set enabled status for a nonexistent staking duration
        it(printTitle('owner', 'cannot set enabled status for a nonexistent staking duration'), async () => {
            await assertThrows(scenarioSetStakingDurationEnabled({
                durationId: '2d',
                enabled: false,
                fromAddress: owner,
                gas: 8000000,
            }), 'Set enabled status for a nonexistent staking duration');
        });


        // Owner cannot set staking duration enabled status to its current value
        it(printTitle('owner', 'cannot set staking duration enabled status to its current value'), async () => {
            await assertThrows(scenarioSetStakingDurationEnabled({
                durationId: '1d',
                enabled: false,
                fromAddress: owner,
                gas: 8000000,
            }), 'Set staking duration enabled status to its current value');
        });


        // Random account cannot set staking duration enabled status
        it(printTitle('random account', 'cannot set staking duration enabled status'), async () => {
            await assertThrows(scenarioSetStakingDurationEnabled({
                durationId: '1d',
                enabled: true,
                fromAddress: user,
                gas: 8000000,
            }), 'Random account set staking duration enabled status');
        });


    });

};
