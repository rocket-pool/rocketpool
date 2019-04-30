// Artifacts
const RocketUpgrade = artifacts.require('./RocketUpgrade');

// Initialise upgrade approvers
module.exports = async (done) => {
    try {

        // Parse & validate arguments
        const args = process.argv.slice(4);
        if (args.length != 3) throw new Error('Usage: truffle exec initialise-approvers.js address1 address2 address3');
        const approvers = args;
        approvers.forEach((approver, i) => {
            if (!web3.utils.isAddress(approver)) throw new Error('Invalid approver address ' + (i + 1));
        });

        // Get owner account
        const accounts = await web3.eth.getAccounts();
        const owner = accounts[0];

        // Initialise contracts
        const rocketUpgrade = await RocketUpgrade.deployed();

        // Initialise approvers
        await rocketUpgrade.initialiseUpgradeApprovers(approvers, {from: owner});

        // Success
        done('Upgrade approvers initialised successfully: ' + approvers.join(' '));

    }
    catch (e) {
        done(e);
    }
}
