import { RocketNodeSettings } from '../_lib/artifacts';
import { printTitle, assertThrows, TimeController } from '../_lib/utils/general';
import { createNodeContract } from '../_helpers/rocket-node';
import { addNodeTask } from '../_helpers/rocket-node-task';
import { scenarioCheckin } from './rocket-node-task-calculate-node-fee-scenarios';

export default function() {

    contract('RocketNodeTasks - Calculate Node Fee', async (accounts) => {


        // Node accounts
        const nodeOperator1 = accounts[1];
        const nodeOperator2 = accounts[2];
        const nodeOperator3 = accounts[3];


        // Setup
        let rocketNodeSettings;
        let voteCycleDuration;
        let nodeContract1;
        let nodeContract2;
        let nodeContract3;
        before(async () => {

            // Get settings
            rocketNodeSettings = await RocketNodeSettings.deployed();
            voteCycleDuration = parseInt(await rocketNodeSettings.getFeeVoteCycleDuration.call());

            // Create node contracts
            nodeContract1 = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator1});
            nodeContract2 = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator2});
            nodeContract3 = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator3});

        });


        // Node fee increases
        it(printTitle('node fee', 'increases if most votes cast are to increase'), async () => {

            // Get initial node fee
            let nodeFeePerc1 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Checkin nodes to vote
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 1, // Increase
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract2,
                feeVote: 1, // Increase
                fromAddress: nodeOperator2,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract3,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator3,
                gas: 5000000,
            });

            // Move to next voting cycle and checkin to finalise
            await TimeController.addSeconds(voteCycleDuration);
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await TimeController.addSeconds(voteCycleDuration);

            // Get updated node fee
            let nodeFeePerc2 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Check updated node fee
            assert.isTrue(nodeFeePerc2 > nodeFeePerc1, 'Node fee was not increased correctly');

        });


        // Node fee decreases
        it(printTitle('node fee', 'decreases if most votes cast are to decrease'), async () => {

            // Get initial node fee
            let nodeFeePerc1 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Checkin nodes to vote
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract2,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator2,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract3,
                feeVote: 1, // Increase
                fromAddress: nodeOperator3,
                gas: 5000000,
            });

            // Move to next voting cycle and checkin to finalise
            await TimeController.addSeconds(voteCycleDuration);
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await TimeController.addSeconds(voteCycleDuration);

            // Get updated node fee
            let nodeFeePerc2 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Check updated node fee
            assert.isTrue(nodeFeePerc2 < nodeFeePerc1, 'Node fee was not decreased correctly');

        });


        // Node fee is unchanged
        it(printTitle('node fee', 'is unchanged if most votes cast are for no change'), async () => {

            // Get initial node fee
            let nodeFeePerc1 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Checkin nodes to vote
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract2,
                feeVote: 0, // No change
                fromAddress: nodeOperator2,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract3,
                feeVote: 1, // Increase
                fromAddress: nodeOperator3,
                gas: 5000000,
            });

            // Move to next voting cycle and checkin to finalise
            await TimeController.addSeconds(voteCycleDuration);
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await TimeController.addSeconds(voteCycleDuration);

            // Get updated node fee
            let nodeFeePerc2 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Check updated node fee
            assert.equal(nodeFeePerc2, nodeFeePerc1, 'Node fee changed and should not have');

        });


        // Node fee is unchanged if votes are tied
        it(printTitle('node fee', 'is unchanged if votes are tied'), async () => {

            // Get initial node fee
            let nodeFeePerc1 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Checkin nodes to vote
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 1, // Increase
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract2,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator2,
                gas: 5000000,
            });

            // Move to next voting cycle and checkin to finalise
            await TimeController.addSeconds(voteCycleDuration);
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await TimeController.addSeconds(voteCycleDuration);

            // Get updated node fee
            let nodeFeePerc2 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Check updated node fee
            assert.equal(nodeFeePerc2, nodeFeePerc1, 'Node fee changed and should not have');

        });


        // Node operator cannot vote more than once per cycle
        it(printTitle('node operator ', 'cannot vote more than once per cycle'), async () => {

            // Get initial node fee
            let nodeFeePerc1 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Checkin node to vote repeatedly
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 1, // Increase
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 1, // Increase
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 1, // Increase
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            
            // Checkin other nodes to vote
            await scenarioCheckin({
                nodeContract: nodeContract2,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator2,
                gas: 5000000,
            });
            await scenarioCheckin({
                nodeContract: nodeContract3,
                feeVote: 2, // Decrease
                fromAddress: nodeOperator3,
                gas: 5000000,
            });

            // Move to next voting cycle and checkin to finalise
            await TimeController.addSeconds(voteCycleDuration);
            await scenarioCheckin({
                nodeContract: nodeContract1,
                feeVote: 0, // No change
                fromAddress: nodeOperator1,
                gas: 5000000,
            });
            await TimeController.addSeconds(voteCycleDuration);

            // Get updated node fee
            let nodeFeePerc2 = parseInt(await rocketNodeSettings.getFeePerc.call());

            // Check updated node fee
            assert.isTrue(nodeFeePerc2 < nodeFeePerc1, 'Node fee was not decreased correctly');

        });


    });

}
