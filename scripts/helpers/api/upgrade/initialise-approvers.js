// Artifacts
const RocketUpgrade = artifacts.require('./RocketUpgrade');

// Initialise upgrade approvers
module.exports = async (done) => {
    try {

        // Validate arguments
        const args = process.argv.splice(4);
        if (args.length != 3) throw new Error('Usage: truffle exec initialise-approvers.js address1 address2 address3');
        args.forEach((arg, i) => {
            if (!web3.utils.isAddress(arg)) throw new Error('Invalid approver address ' + (i + 1));
        });

        // Get owner account
        const accounts = await web3.eth.getAccounts();
        const owner = accounts[0];

        // Initialise contracts
        const rocketUpgrade = await RocketUpgrade.deployed();

        // Initialise approvers
        await rocketUpgrade.initialiseUpgradeApprovers(args, {from: owner});

        // Success
        done('Upgrade approvers initialised successfully: ' + args.join(' '));

    }
    catch (e) {
        done(e);
    }
}
