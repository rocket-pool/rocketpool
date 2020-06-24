import { RocketMinipool, RocketMinipoolStatus, RocketNodeManager, RocketStorage } from '../_utils/artifacts';


// Submit a minipool exited event
export async function submitExited(minipoolAddress, epoch, txOptions) {

    // Load contracts
    const [
        rocketMinipoolStatus,
        rocketNodeManager,
        rocketStorage,
    ] = await Promise.all([
        RocketMinipoolStatus.deployed(),
        RocketNodeManager.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketNodeManager.getTrustedNodeCount.call();

    // Get submission keys
    let nodeSubmissionKey = web3.utils.soliditySha3('minipool.exited.submitted.node', txOptions.from, minipoolAddress, epoch);
    let submissionCountKey = web3.utils.soliditySha3('minipool.exited.submitted.count', minipoolAddress, epoch);

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketStorage.getBool.call(nodeSubmissionKey),
            rocketStorage.getUint.call(submissionCountKey),
        ]).then(
            ([nodeSubmitted, count]) =>
            ({nodeSubmitted, count})
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit
    await rocketMinipoolStatus.submitMinipoolExited(minipoolAddress, epoch, txOptions);

    // Initialise minipool contract
    let minipool = await RocketMinipool.at(minipoolAddress);

    // Get updated submission details & minipool status
    let [submission2, minipoolStatus] = await Promise.all([
        getSubmissionDetails(),
        minipool.getStatus.call(),
    ]);

    // Check if minipool should be exited
    let expectExited = submission2.count.mul(web3.utils.toBN(2)).gte(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check minipool status
    const exited = web3.utils.toBN(3);
    if (expectExited) assert(minipoolStatus.eq(exited), 'Incorrect updated minipool status');
    else assert(!minipoolStatus.eq(exited), 'Incorrect updated minipool status');

}

