// Artifacts
const AddressSetStorage = artifacts.require('./AddressSetStorage');

// Initialise upgrade approvers
module.exports = async (done) => {
    try {

        // Parse & validate arguments
        const args = process.argv.slice(4);
        if (args.length != 0) throw new Error('Usage: truffle exec get-approvers.js');

        // Initialise contracts
        const addressSetStorage = await AddressSetStorage.deployed();

        // Get approvers
        let key = web3.utils.soliditySha3('upgrade.approvers');
        let approvers = [];
        let approverCount = parseInt(await addressSetStorage.getCount.call(key));
        for (let ai = 0; ai < approverCount; ++ai) {
            let approverAddress = await addressSetStorage.getItem.call(key, ai);
            approvers.push(approverAddress);
        }

        // Log
        done('Upgrade approvers: ' + approvers.join(' '));

    }
    catch (e) {
        done(e);
    }
}
