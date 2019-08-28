// Artifacts
const AddressSetStorage = artifacts.require('./AddressSetStorage');
const RocketMinipool = artifacts.require('./RocketMinipool');

// Get active minipools
module.exports = async (done) => {
    try {

        // Parse & validate arguments
        const args = process.argv.slice(4);
        if (args.length != 1) throw new Error('Usage: truffle exec get-active-minipools.js durationID');
        const durationID = args[0];

        // Initialise contracts
        const addressSetStorage = await AddressSetStorage.deployed();

        // Get active minipool addresses
        let key = web3.utils.soliditySha3('minipools.active', durationID);
        let minipoolAddresses = [];
        let minipoolCount = parseInt(await addressSetStorage.getCount.call(key));
        for (let mi = 0; mi < minipoolCount; ++mi) {
            let minipoolAddress = await addressSetStorage.getItem.call(key, mi);
            minipoolAddresses.push(minipoolAddress);
        }

        // Get minipool details
        let minipools = [];
        for (let mi = 0; mi < minipoolCount; ++mi) {
            let address = minipoolAddresses[mi];
            let minipool = await RocketMinipool.at(address);
            let [status, stakingDurationID, depositCount, userDepositCapacity, userDepositTotal, nodeOwner, nodeContract, nodeTrusted] = await Promise.all([
                minipool.getStatus.call(),
                minipool.getStakingDurationID.call(),
                minipool.getDepositCount.call(),
                minipool.getUserDepositCapacity.call(),
                minipool.getUserDepositTotal.call(),
                minipool.getNodeOwner.call(),
                minipool.getNodeContract.call(),
                minipool.getNodeTrusted.call(),
            ]);
            minipools.push({
                address,
                status: parseInt(status),
                stakingDurationID,
                depositCount: parseInt(depositCount),
                userDepositCapacity: parseInt(web3.utils.fromWei(userDepositCapacity, 'ether')),
                userDepositTotal: parseInt(web3.utils.fromWei(userDepositTotal, 'ether')),
                nodeOwner,
                nodeContract,
                nodeTrusted,
            });
        }

        // Log
        minipools.forEach(minipool => {
            console.log('----------');
            console.log('Address:              ', minipool.address);
            console.log('Status:               ', minipool.status);
            console.log('Staking duration:     ', minipool.stakingDurationID);
            console.log('Deposit count:        ', minipool.depositCount);
            console.log('User deposit capacity:', minipool.userDepositCapacity);
            console.log('User deposit total:   ', minipool.userDepositTotal);
            console.log('Node owner:           ', minipool.nodeOwner);
            console.log('Node contract:        ', minipool.nodeContract);
            console.log('Node trusted:         ', minipool.nodeTrusted);
        });
        done('----------');

    }
    catch (err) {
        done(err);
    }
};
