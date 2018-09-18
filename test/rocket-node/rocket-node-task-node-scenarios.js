// Dependencies
import { RocketNodeTasks, TestNodeTask } from '../_lib/artifacts';


// Get number of times test tasks run
async function getTimesTestTasksRun(nodeAddress) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get task count
    let count = await rocketNodeTasks.getTaskCount.call();

    // Process tasks
    let times = [], taskTimes, address, testNodeTask, index;
    for (index = 0; index < count; ++index) {

        // Initialise task
        address = await rocketNodeTasks.getTaskAddressAt.call(index);
        testNodeTask = await TestNodeTask.at(address);

        // Get times run
        taskTimes = await testNodeTask.timesRun.call(nodeAddress);
        times.push(parseInt(taskTimes));

    }

    // Return times run
    return times;

}


// Run node tasks
export async function scenarioRunTasks({fromAddress, gas}) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get initial test task run counts
    let timesRun1 = await getTimesTestTasksRun(fromAddress);

    // Run tasks
    await rocketNodeTasks.run({from: fromAddress, gas: gas});

    // Get updated test task run counts
    let timesRun2 = await getTimesTestTasksRun(fromAddress);

    // Asserts
    assert.equal(timesRun2.length, timesRun1.length, 'Task list count changed and should not have');
    timesRun1.forEach((address, index) => {
        assert.equal(timesRun2[index], timesRun1[index] + 1, 'Task run count was not updated correctly');
    });

}
