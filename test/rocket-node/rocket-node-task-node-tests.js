import { printTitle, assertThrows } from '../_lib/utils/general';
import { createNodeContract } from '../_helpers/rocket-node';
import { createTestNodeTaskContract, addNodeTask, removeNodeTask, updateNodeTask } from '../_helpers/rocket-node-task';
import { scenarioRunTasks, scenarioRunOneTask } from './rocket-node-task-node-scenarios';

export default function() {

    contract('RocketNodeTasks - Node', async (accounts) => {


        // Owner account
        const owner = accounts[0];

        // Node accounts
        const nodeOperator1 = accounts[1];
        const nodeOperator2 = accounts[2];
        const nodeOperator3 = accounts[3];


        // Setup
        let testNodeTask1;
        let testNodeTask2;
        let testNodeTask3;
        let testNodeTask1v2;
        before(async () => {

            // Deploy test node tasks
            testNodeTask1 = await createTestNodeTaskContract({name: 'NodeTask1', owner});
            testNodeTask2 = await createTestNodeTaskContract({name: 'NodeTask2', owner});
            testNodeTask3 = await createTestNodeTaskContract({name: 'NodeTask3', owner});
            testNodeTask1v2 = await createTestNodeTaskContract({name: 'NodeTask1v2', owner});

            // Create node contracts
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator1});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator2});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: nodeOperator3});

        });


        // Add node tasks
        it(printTitle('-----', 'add node tasks'), async () => {
            await addNodeTask({taskAddress: testNodeTask1.address, owner});
            await addNodeTask({taskAddress: testNodeTask2.address, owner});
            await addNodeTask({taskAddress: testNodeTask3.address, owner});
        });


        // Run tasks
        it(printTitle('node', 'running tasks'), async () => {
            await scenarioRunTasks({
                fromAddress: nodeOperator1,
                gas: 500000,
            });
            await scenarioRunTasks({
                fromAddress: nodeOperator2,
                gas: 500000,
            });
            await scenarioRunOneTask({
                taskAddress: testNodeTask1.address,
                fromAddress: nodeOperator1,
                gas: 500000,
            });
        });


        // Remove node tasks
        it(printTitle('-----', 'remove node tasks'), async () => {
            await removeNodeTask({taskAddress: testNodeTask2.address, owner});
        });


        // Run tasks
        it(printTitle('node', 'running tasks'), async () => {
            await scenarioRunTasks({
                fromAddress: nodeOperator2,
                gas: 500000,
            });
            await scenarioRunTasks({
                fromAddress: nodeOperator3,
                gas: 500000,
            });
            await scenarioRunOneTask({
                taskAddress: testNodeTask1.address,
                fromAddress: nodeOperator1,
                gas: 500000,
            });
        });


        // Update node tasks
        it(printTitle('-----', 'update node tasks'), async () => {
            await updateNodeTask({oldAddress: testNodeTask1.address, newAddress: testNodeTask1v2.address, owner});
        });


        // Run tasks
        it(printTitle('node', 'running tasks'), async () => {
            await scenarioRunTasks({
                fromAddress: nodeOperator1,
                gas: 500000,
            });
            await scenarioRunTasks({
                fromAddress: nodeOperator2,
                gas: 500000,
            });
            await scenarioRunTasks({
                fromAddress: nodeOperator3,
                gas: 500000,
            });
            await scenarioRunOneTask({
                taskAddress: testNodeTask1v2.address,
                fromAddress: nodeOperator1,
                gas: 500000,
            });
        });


    });

};
