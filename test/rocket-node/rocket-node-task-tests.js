import { printTitle, assertThrows } from '../_lib/utils/general';
import { TestNodeTask } from '../_lib/artifacts';
import { scenarioAddNodeTask } from './rocket-node-task-scenarios';

export default function() {

    contract('RocketNodeTasks', async (accounts) => {


        // Owner account
        const owner = accounts[0];


        // Deploy test node tasks
        let testNodeTask1;
        let testNodeTask2;
        let testNodeTask3;
        let testNodeTask1v2;
        before(async () => {
            testNodeTask1 = await TestNodeTask.new('NodeTask1', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask2 = await TestNodeTask.new('NodeTask2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask3 = await TestNodeTask.new('NodeTask3', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask1v2 = await TestNodeTask.new('NodeTask1v2', {gas: 5000000, gasPrice: 10000000000, from: owner});
        });


        // Owner can add a node task
        it(printTitle('owner', 'can add a node task'), async () => {
            await scenarioAddNodeTask({
                taskAddress: testNodeTask1.address,
                fromAddress: owner,
                gas: 500000,
            });
        });


    });

};
