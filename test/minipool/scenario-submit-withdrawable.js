import { RocketMinipool, RocketMinipoolStatus, RocketNodeManager, RocketStorage } from '../_utils/artifacts';


// Submit a minipool withdrawable event
export async function submitWithdrawable(minipoolAddress, withdrawalBalance, epoch, txOptions) {

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
    let nodeSubmissionKey = web3.utils.soliditySha3('minipool.withdrawable.submitted.node', txOptions.from, minipoolAddress, withdrawalBalance, epoch);
    let submissionCountKey = web3.utils.soliditySha3('minipool.withdrawable.submitted.count', minipoolAddress, withdrawalBalance, epoch);

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

    // Get minipool details
    function getMinipoolDetails() {
        return RocketMinipool.at(minipoolAddress).then(minipool => Promise.all([
            minipool.getStatus.call(),
            minipool.getStakingEndBalance.call(),
        ])).then(
            ([status, endBalance]) =>
            ({status, endBalance})
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit
    await rocketMinipoolStatus.submitMinipoolWithdrawable(minipoolAddress, withdrawalBalance, epoch, txOptions);

    // Get updated submission details & minipool details
    let [submission2, minipoolDetails] = await Promise.all([
        getSubmissionDetails(),
        getMinipoolDetails(),
    ]);

    // Check if minipool should be withdrawable
    let expectWithdrawable = submission2.count.mul(web3.utils.toBN(2)).gte(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check minipool details
    const withdrawable = web3.utils.toBN(4);
    if (expectWithdrawable) {
        assert(minipoolDetails.status.eq(withdrawable), 'Incorrect updated minipool status');
        assert(minipoolDetails.endBalance.eq(web3.utils.toBN(withdrawalBalance)), 'Incorrect updated minipool end balance');
    } else {
        assert(!minipoolDetails.status.eq(withdrawable), 'Incorrect updated minipool status');
    }

}

