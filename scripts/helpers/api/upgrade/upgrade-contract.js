// Dependencies
const pako = require('pako');

// Artifacts
const RocketStorage = artifacts.require('./RocketStorage');
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
        if (args.length != 4) throw new Error('Usage: truffle exec upgrade-contract.js contractName contractArtifact approver1 approver2');
        const contractName = args[0];
        const contractArtifact = args[1];
        const approvers = args.slice(2);
        approvers.forEach((approver, i) => {
            if (!web3.utils.isAddress(approver)) throw new Error('Invalid approver address ' + (i + 1));
        });

        // Get owner account
        const accounts = await web3.eth.getAccounts();
        const owner = accounts[0];

        // Initialise contracts
        const rocketStorage = await RocketStorage.deployed();
        const rocketUpgrade = await RocketUpgrade.deployed();

        // Get contract to upgrade & deploy instance
        const UpgradeContract = artifacts.require(contractArtifact);
        const upgradeContract = await UpgradeContract.new(rocketStorage.address, {from: owner});
        const upgradeContractAbi = compressAbi(UpgradeContract.abi);

        // Upgrade contract
        for (let i = 0; i < approvers.length; ++i) {
            await rocketUpgrade.upgradeContract(contractName, upgradeContract.address, upgradeContractAbi, false, false, {from: approvers[i]});
        }

        // Success
        done('Contract upgraded successfully - ' + contractName + ': ' + upgradeContract.address);

    }
    catch (e) {
        done(e);
    }
}
