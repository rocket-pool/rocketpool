import { RocketNodeStatus }  from '../../_lib/artifacts';

// Performs node checkin and asserts that checkin was preformed successfully
export async function scenarioNodeCheckin({averageLoad, fromAddress}) {
    const rocketNodeStatus = await RocketNodeStatus.deployed();

    // Estimate gas required to launch pools
    let gasEstimate = await rocketNodeStatus.nodeCheckin.estimateGas(averageLoad, {from: fromAddress});

    // Check in
    let result = await rocketNodeStatus.nodeCheckin(averageLoad, {
        from: fromAddress,
        gas: parseInt(gasEstimate) + 100000,
    });

    // Assert NodeCheckin event was logged
    let log = result.logs.find(({ event }) => event == 'NodeCheckin');
    assert.notEqual(log, undefined, 'NodeCheckin event was not logged');

    // Get checkin details
    let checkinNodeAddress = log.args._nodeAddress.valueOf();
    let checkinLoadAverage = log.args.loadAverage.valueOf();

    // Check checkin details
    assert.equal(checkinNodeAddress, fromAddress, 'Checked in node address does not match');
    assert.notEqual(checkinLoadAverage, 0, 'Checked in load average is not correct');

}

