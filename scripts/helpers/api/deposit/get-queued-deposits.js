// Artifacts
const Bytes32QueueStorage = artifacts.require('./Bytes32QueueStorage');
const RocketStorage = artifacts.require('./RocketStorage');

// Get active minipools
module.exports = async (done) => {
    try {

        // Parse & validate arguments
        const args = process.argv.slice(4);
        if (args.length != 1) throw new Error('Usage: truffle exec get-queued-deposits.js durationID');
        const durationID = args[0];

        // Initialise contracts
        const bytes32QueueStorage = await Bytes32QueueStorage.deployed();
        const rocketStorage = await RocketStorage.deployed();

        // Get queued deposit IDs
        let key = web3.utils.soliditySha3('deposits.queue', durationID);
        let depositIDs = [];
        let depositCount = parseInt(await bytes32QueueStorage.getQueueLength.call(key));
        for (let di = 0; di < depositCount; ++di) {
            let depositID = await bytes32QueueStorage.getQueueItem.call(key, di);
            depositIDs.push(depositID);
        }

        // Get deposit details
        let deposits = [];
        for (let di = 0; di < depositCount; ++di) {
            let id = depositIDs[di];
            let [userID, groupID, stakingDurationID, totalAmount, queuedAmount, stakingAmount, refundedAmount, withdrawnAmount] = await Promise.all([
                rocketStorage.getAddress.call(web3.utils.soliditySha3('deposit.userID', id)),
                rocketStorage.getAddress.call(web3.utils.soliditySha3('deposit.groupID', id)),
                rocketStorage.getString.call(web3.utils.soliditySha3('deposit.stakingDurationID', id)),
                rocketStorage.getUint.call(web3.utils.soliditySha3('deposit.totalAmount', id)),
                rocketStorage.getUint.call(web3.utils.soliditySha3('deposit.queuedAmount', id)),
                rocketStorage.getUint.call(web3.utils.soliditySha3('deposit.stakingAmount', id)),
                rocketStorage.getUint.call(web3.utils.soliditySha3('deposit.refundedAmount', id)),
                rocketStorage.getUint.call(web3.utils.soliditySha3('deposit.withdrawnAmount', id)),
            ]);
            deposits.push({
                id,
                userID,
                groupID,
                stakingDurationID,
                totalAmount: parseFloat(web3.utils.fromWei(totalAmount, 'ether')),
                queuedAmount: parseFloat(web3.utils.fromWei(queuedAmount, 'ether')),
                stakingAmount: parseFloat(web3.utils.fromWei(stakingAmount, 'ether')),
                refundedAmount: parseFloat(web3.utils.fromWei(refundedAmount, 'ether')),
                withdrawnAmount: parseFloat(web3.utils.fromWei(withdrawnAmount, 'ether')),
            });
        }

        // Log
        deposits.forEach(deposit => {
            console.log('----------');
            console.log('ID:                 ', deposit.id);
            console.log('User ID :           ', deposit.userID);
            console.log('Group ID:           ', deposit.groupID);
            console.log('Staking duration ID:', deposit.stakingDurationID);
            console.log('Total amount:       ', deposit.totalAmount);
            console.log('Queued amount:      ', deposit.queuedAmount);
            console.log('Staking amount:     ', deposit.stakingAmount);
            console.log('Refunded amount:    ', deposit.refundedAmount);
            console.log('Withdrawn amount:   ', deposit.withdrawnAmount);
        });
        done('----------');

    }
    catch (err) {
        done(err);
    }
};
