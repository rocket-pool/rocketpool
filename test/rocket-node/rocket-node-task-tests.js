import { printTitle, assertThrows } from '../_lib/utils/general';
import { TestNodeTask } from '../_lib/artifacts';
import { scenarioAddNodeTask, scenarioRemoveNodeTask, scenarioUpdateNodeTask } from './rocket-node-task-scenarios';

export default function() {

    contract('RocketNodeTasks', async (accounts) => {


        // Owner account
        const owner = accounts[0];


        // Deploy test node tasks
        let testNodeTask1;
        let testNodeTask2;
        let testNodeTask3;
        let testNodeTask1v2;
        let testNodeTask2v2;
        before(async () => {
            testNodeTask1 = await TestNodeTask.new('NodeTask1', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask2 = await TestNodeTask.new('NodeTask2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask3 = await TestNodeTask.new('NodeTask3', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask1v2 = await TestNodeTask.new('NodeTask1v2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask2v2 = await TestNodeTask.new('NodeTask2v2', {gas: 5000000, gasPrice: 10000000000, from: owner});
        });


        // Owner can add a node task
        it(printTitle('owner', 'can add a node task'), async () => {
            await scenarioAddNodeTask({
                taskAddress: testNodeTask1.address,
                fromAddress: owner,
                gas: 500000,
            });
            await scenarioAddNodeTask({
                taskAddress: testNodeTask2.address,
                fromAddress: owner,
                gas: 500000,
            });
            await scenarioAddNodeTask({
                taskAddress: testNodeTask3.address,
                fromAddress: owner,
                gas: 500000,
            });
        });


        // Owner can remove a node task
        it(printTitle('owner', 'can remove a node task'), async () => {
            await scenarioRemoveNodeTask({
                taskIndex: 1,
                fromAddress: owner,
                gas: 500000,
            });
        });


        // Owner can update a node task
        it(printTitle('owner', 'can update a node task'), async () => {
            await scenarioUpdateNodeTask({
                taskAddress: testNodeTask1v2.address,
                taskIndex: 0,
                fromAddress: owner,
                gas: 500000,
            });
        });


    });

};
