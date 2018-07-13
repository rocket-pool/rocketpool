// Dependencies
const fs = require('fs');
const Web3 = require('web3');
const decompressAbi = require('../../test/_lib/utils/contract.js').decompressAbi;

// Artifacts
const RocketStorage = artifacts.require('./contract/RocketStorage');

// List of contracts to download by storage name
const downloadContracts = [
    {name: 'rocketPool',                file: 'RocketPool'},
    {name: 'rocketRole',                file: 'RocketRole'},
    {name: 'rocketUser',                file: 'RocketUser'},
    {name: 'rocketNodeAdmin',           file: 'RocketNodeAdmin'},
    {name: 'rocketNodeValidator',       file: 'RocketNodeValidator'},
    {name: 'rocketNodeStatus',          file: 'RocketNodeStatus'},
    {name: 'rocketPoolMini',            file: 'RocketPoolMini'},
    {name: 'rocketPoolMiniDelegate',    file: 'RocketPoolMiniDelegate'},
    {name: 'rocketFactory',             file: 'RocketFactory'},
    {name: 'rocketUpgrade',             file: 'RocketUpgrade'},
    {name: 'rocketUtils',               file: 'RocketUtils'},
    {name: 'rocketPartnerAPI',          file: 'RocketPartnerAPI'},
    {name: 'rocketDepositToken',        file: 'RocketDepositToken'},
    {name: 'rocketPoolToken',           file: 'RocketPoolToken'},
    {name: 'rocketVault',               file: 'RocketVault'},
    {name: 'rocketVaultStore',          file: 'RocketVaultStore'},
    {name: 'rocketSettings',            file: 'RocketSettings'},
    {name: 'casper',                    file: 'Casper'},
];

// Download contract artifacts from network
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 1) done('Incorrect number of arguments. Please enter: download path.');

    // Parse arguments
    let [downloadPath] = args;
    if (!downloadPath.match(/\/$/)) downloadPath += '/';

    // Get contract dependencies & current network
    const rocketStorage = await RocketStorage.deployed();
    let networkId = await RocketStorage.detectNetwork();

    // Download contract data
    let i, contract;
    for (let i = 0; i < downloadContracts.length; ++i) {
        contract = downloadContracts[i];

        // Get contract address and abi
        let address = await rocketStorage.getAddress(Web3.utils.soliditySha3('contract.name', contract.name));
        let abi = await rocketStorage.getString(Web3.utils.soliditySha3('contract.abi', contract.name));

        // Build artifact
        let artifact = {};
        if (abi) artifact['abi'] = decompressAbi(abi);
        if (!address.match(/0x0{40}/)) {
            artifact['networks'] = {};
            artifact['networks'][networkId] = {'address': address};
        }
        if (!(artifact.abi || artifact.networks)) {
            console.log('No address or ABI found for ' + contract.name + ', skipping.');
            continue;
        }

        // Write artifact
        let filePath = downloadPath + contract.file + '.json';
        let writeMessage = await new Promise((resolve) => {
            fs.writeFile(filePath, JSON.stringify(artifact), {mode: 0o755}, (err) => {
                if (err) resolve('Unable to save artifact file ' + filePath);
                else resolve('Artifact file ' + filePath + ' saved successfully.');
            });
        });
        console.log(writeMessage);

    }

    // Complete
    done('Contract artifacts downloaded successfully: ' + args.join(', '));

};
