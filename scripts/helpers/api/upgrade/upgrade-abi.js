// Dependencies
const pako = require('pako');

// Artifacts
const RocketUpgrade = artifacts.require('./RocketUpgrade');

// Compress contract ABI
function compressAbi(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

// Upgrade contract
module.exports = async (done) => {
    try {

        // Parse & validate arguments
        const args = process.argv.slice(4);
        if (args.length != 4) throw new Error('Usage: truffle exec upgrade-abi.js contractName contractArtifact approver1 approver2');
        const contractName = args[0];
        const contractArtifact = args[1];
        const approvers = args.slice(2);
        approvers.forEach((approver, i) => {
            if (!web3.utils.isAddress(approver)) throw new Error('Invalid approver address ' + (i + 1));
        });

        // Initialise contracts
        const rocketUpgrade = await RocketUpgrade.deployed();

        // Get contract to upgrade & deploy instance
        const UpgradeContract = artifacts.require(contractArtifact);
        const upgradeContractAbi = compressAbi(UpgradeContract.abi);

        // Upgrade contract
        for (let i = 0; i < approvers.length; ++i) {
            await rocketUpgrade.upgradeABI(contractName, upgradeContractAbi, {from: approvers[i]});
        }

        // Success
        done('Contract ABI upgraded successfully: ' + contractName);

    }
    catch (e) {
        done(e);
    }
}
