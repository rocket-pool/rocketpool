import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketStorage, TestNodeTask } from '../_lib/artifacts';
import { scenarioAddNodeTask, scenarioRemoveNodeTask, scenarioUpdateNodeTask } from './rocket-node-task-admin-scenarios';
import { scenarioRunTasks } from './rocket-node-task-node-scenarios';

export default function() {

    contract('RocketNodeTasks - Node', async (accounts) => {


        // Owner account
        const owner = accounts[0];

        // Node accounts
        // TODO: use valid rocket pool nodes only
        const node1 = accounts[1];
        const node2 = accounts[2];


        // Deploy test node tasks
        let rocketStorage;
        let testNodeTask1;
        let testNodeTask2;
        let testNodeTask3;
        let testNodeTask1v2;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
            testNodeTask1 = await TestNodeTask.new(rocketStorage.address, 'NodeTask1', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask2 = await TestNodeTask.new(rocketStorage.address, 'NodeTask2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask3 = await TestNodeTask.new(rocketStorage.address, 'NodeTask3', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask1v2 = await TestNodeTask.new(rocketStorage.address, 'NodeTask1v2', {gas: 5000000, gasPrice: 10000000000, from: owner});
        });


        // Add node tasks
        it(printTitle('-----', 'add node tasks'), async () => {
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


        // Run tasks
        // TODO: initiate calls from valid rocket pool nodes only
        it(printTitle('node', 'can run tasks'), async () => {
            await scenarioRunTasks({
                fromAddress: node1,
                gas: 500000,
            });
        });


    });

};
