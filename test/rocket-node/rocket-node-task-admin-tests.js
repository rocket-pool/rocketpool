import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketStorage, TestNodeTask } from '../_lib/artifacts';
import { scenarioAddNodeTask, scenarioRemoveNodeTask, scenarioUpdateNodeTask } from './rocket-node-task-admin-scenarios';

export default function() {

    contract('RocketNodeTasks - Admin', async (accounts) => {


        // Owner account
        const owner = accounts[0];


        // Deploy test node tasks
        let rocketStorage;
        let testNodeTask1;
        let testNodeTask2;
        let testNodeTask3;
        let testNodeTask4;
        let testNodeTask1v2;
        let testNodeTask1v3;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
            testNodeTask1 = await TestNodeTask.new(rocketStorage.address, 'NodeTask1', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask2 = await TestNodeTask.new(rocketStorage.address, 'NodeTask2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask3 = await TestNodeTask.new(rocketStorage.address, 'NodeTask3', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask4 = await TestNodeTask.new(rocketStorage.address, 'NodeTask4', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask1v2 = await TestNodeTask.new(rocketStorage.address, 'NodeTask1v2', {gas: 5000000, gasPrice: 10000000000, from: owner});
            testNodeTask1v3 = await TestNodeTask.new(rocketStorage.address, 'NodeTask1v3', {gas: 5000000, gasPrice: 10000000000, from: owner});
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


        // Owner cannot add a node task with an invalid address
        it(printTitle('owner', 'cannot add a node task with an invalid address'), async () => {
            await assertThrows(scenarioAddNodeTask({
                taskAddress: '0x0000000000000000000000000000000000000000',
                fromAddress: owner,
                gas: 500000,
            }), 'Added a node task with an invalid address');
        });


        // Owner cannot add a node task that already exists
        it(printTitle('owner', 'cannot add a node task with an existing address'), async () => {
            await assertThrows(scenarioAddNodeTask({
                taskAddress: testNodeTask1.address,
                fromAddress: owner,
                gas: 500000,
            }), 'Added a node task with an existing address');
        });


        // Owner can remove a node task
        it(printTitle('owner', 'can remove a node task'), async () => {
            await scenarioRemoveNodeTask({
                taskAddress: testNodeTask2.address,
                fromAddress: owner,
                gas: 500000,
            });
        });


        // Owner cannot remove a nonexistant node task
        it(printTitle('owner', 'cannot remove a nonexistant node task'), async () => {
            await assertThrows(scenarioRemoveNodeTask({
                taskAddress: testNodeTask4.address,
                fromAddress: owner,
                gas: 500000,
            }), 'Removed a nonexistant node task');
        });


        // Owner can update a node task
        it(printTitle('owner', 'can update a node task'), async () => {
            await scenarioUpdateNodeTask({
                oldAddress: testNodeTask1.address,
                newAddress: testNodeTask1v2.address,
                fromAddress: owner,
                gas: 500000,
            });
        });


        // Owner cannot update a node task with an invalid address
        it(printTitle('owner', 'cannot update a node task with an invalid address'), async () => {
            await assertThrows(scenarioUpdateNodeTask({
                oldAddress: testNodeTask1v2.address,
                newAddress: '0x0000000000000000000000000000000000000000',
                fromAddress: owner,
                gas: 500000,
            }), 'Updated a node task with an invalid address');
        });


        // Owner cannot update a node task with an existing address
        it(printTitle('owner', 'cannot update a node task with an existing address'), async () => {
            await assertThrows(scenarioUpdateNodeTask({
                oldAddress: testNodeTask1v2.address,
                newAddress: testNodeTask3.address,
                fromAddress: owner,
                gas: 500000,
            }), 'Updated a node task with an existing address');
        });


        // Owner cannot update a nonexistant node task
        it(printTitle('owner', 'cannot update a nonexistant node task'), async () => {
            await assertThrows(scenarioUpdateNodeTask({
                oldAddress: testNodeTask4.address,
                newAddress: testNodeTask1v3.address,
                fromAddress: owner,
                gas: 500000,
            }), 'Updated a nonexistant node task');
        });


        // Random account cannot add a node task
        it(printTitle('random account', 'cannot add a node task'), async () => {
            await assertThrows(scenarioAddNodeTask({
                taskAddress: testNodeTask4.address,
                fromAddress: accounts[1],
                gas: 500000,
            }), 'Random account added a node task');
        });


        // Random account cannot remove a node task
        it(printTitle('random account', 'cannot remove a node task'), async () => {
            await assertThrows(scenarioRemoveNodeTask({
                taskAddress: testNodeTask1v2.address,
                fromAddress: accounts[1],
                gas: 500000,
            }), 'Random account removed a node task');
        });


        // Random account cannot update a node task
        it(printTitle('random account', 'cannot update a node task'), async () => {
            await assertThrows(scenarioUpdateNodeTask({
                oldAddress: testNodeTask1v2.address,
                newAddress: testNodeTask1v3.address,
                fromAddress: accounts[1],
                gas: 500000,
            }), 'Random account updated a node task');
        });


    });

};
