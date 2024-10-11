/*** Dependencies ********************/
import { artifacts } from '../_utils/artifacts';

const hre = require('hardhat');
const pako = require('pako');
const fs = require('fs');

const ethers = hre.ethers;

/*** Utility Methods *****************/


// Compress / decompress ABIs
function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

function decompressABI(abi) {
    return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), { to: 'string' }));
}

// Load ABI files and parse
function loadABI(abiFilePath) {
    return JSON.parse(fs.readFileSync(abiFilePath));
}

/*** Contracts ***********************/


// Storage
const rocketStorage = artifacts.require('RocketStorage');

// Network contracts
const networkContracts = {
    // Vault
    rocketVault: artifacts.require('RocketVault'),
    // Tokens
    rocketTokenRPLFixedSupply: artifacts.require('RocketTokenDummyRPL'),
    rocketTokenRETH: artifacts.require('RocketTokenRETH'),
    rocketTokenRPL: artifacts.require('RocketTokenRPL'),
    // Auction
    rocketAuctionManager: artifacts.require('RocketAuctionManager'),
    // Deposit
    rocketDepositPool: artifacts.require('RocketDepositPool'),
    // Minipool
    rocketMinipoolDelegate: artifacts.require('RocketMinipoolDelegate'),
    rocketMinipoolManager: artifacts.require('RocketMinipoolManager'),
    rocketMinipoolQueue: artifacts.require('RocketMinipoolQueue'),
    rocketMinipoolPenalty: artifacts.require('RocketMinipoolPenalty'),
    // Network
    rocketNetworkBalances: artifacts.require('RocketNetworkBalances'),
    rocketNetworkFees: artifacts.require('RocketNetworkFees'),
    rocketNetworkPrices: artifacts.require('RocketNetworkPrices'),
    rocketNetworkPenalties: artifacts.require('RocketNetworkPenalties'),
    // Rewards
    rocketRewardsPool: artifacts.require('RocketRewardsPool'),
    rocketClaimDAO: artifacts.require('RocketClaimDAO'),
    // Node
    rocketNodeDeposit: artifacts.require('RocketNodeDeposit'),
    rocketNodeManager: artifacts.require('RocketNodeManager'),
    rocketNodeStaking: artifacts.require('RocketNodeStaking'),
    // DAOs
    rocketDAOProposal: artifacts.require('RocketDAOProposal'),
    rocketDAONodeTrusted: artifacts.require('RocketDAONodeTrusted'),
    rocketDAONodeTrustedProposals: artifacts.require('RocketDAONodeTrustedProposals'),
    rocketDAONodeTrustedActions: artifacts.require('RocketDAONodeTrustedActions'),
    rocketDAONodeTrustedUpgrade: artifacts.require('RocketDAONodeTrustedUpgrade'),
    rocketDAONodeTrustedSettingsMembers: artifacts.require('RocketDAONodeTrustedSettingsMembers'),
    rocketDAONodeTrustedSettingsProposals: artifacts.require('RocketDAONodeTrustedSettingsProposals'),
    rocketDAONodeTrustedSettingsMinipool: artifacts.require('RocketDAONodeTrustedSettingsMinipool'),
    rocketDAOProtocol: artifacts.require('RocketDAOProtocol'),
    rocketDAOProtocolProposals: artifacts.require('RocketDAOProtocolProposals'),
    rocketDAOProtocolActions: artifacts.require('RocketDAOProtocolActions'),
    rocketDAOProtocolSettingsInflation: artifacts.require('RocketDAOProtocolSettingsInflation'),
    rocketDAOProtocolSettingsRewards: artifacts.require('RocketDAOProtocolSettingsRewards'),
    rocketDAOProtocolSettingsAuction: artifacts.require('RocketDAOProtocolSettingsAuction'),
    rocketDAOProtocolSettingsNode: artifacts.require('RocketDAOProtocolSettingsNode'),
    rocketDAOProtocolSettingsNetwork: artifacts.require('RocketDAOProtocolSettingsNetwork'),
    rocketDAOProtocolSettingsDeposit: artifacts.require('RocketDAOProtocolSettingsDeposit'),
    rocketDAOProtocolSettingsMinipool: artifacts.require('RocketDAOProtocolSettingsMinipool'),
    // v1.1
    rocketMerkleDistributorMainnet: artifacts.require('RocketMerkleDistributorMainnet'),
    rocketDAONodeTrustedSettingsRewards: artifacts.require('RocketDAONodeTrustedSettingsRewards'),
    rocketSmoothingPool: artifacts.require('RocketSmoothingPool'),
    rocketNodeDistributorFactory: artifacts.require('RocketNodeDistributorFactory'),
    rocketNodeDistributorDelegate: artifacts.require('RocketNodeDistributorDelegate'),
    rocketMinipoolFactory: artifacts.require('RocketMinipoolFactory'),
    // v1.2
    rocketMinipoolBase: artifacts.require('RocketMinipoolBase'),
    rocketMinipoolBondReducer: artifacts.require('RocketMinipoolBondReducer'),
    // v1.3
    rocketNetworkSnapshots: artifacts.require('RocketNetworkSnapshots'),
    rocketNetworkVoting: artifacts.require('RocketNetworkVoting'),
    rocketDAOProtocolSettingsProposals: artifacts.require('RocketDAOProtocolSettingsProposals'),
    rocketDAOProtocolVerifier: artifacts.require('RocketDAOProtocolVerifier'),
    rocketDAOSecurity: artifacts.require('RocketDAOSecurity'),
    rocketDAOSecurityActions: artifacts.require('RocketDAOSecurityActions'),
    rocketDAOSecurityProposals: artifacts.require('RocketDAOSecurityProposals'),
    rocketDAOProtocolSettingsSecurity: artifacts.require('RocketDAOProtocolSettingsSecurity'),
    rocketDAOProtocolProposal: artifacts.require('RocketDAOProtocolProposal'),
    // v1.4
    rocketMegapoolFactory: artifacts.require('RocketMegapoolFactory'),
    rocketMegapoolProxy: artifacts.require('RocketMegapoolProxy'),
    rocketMegapoolDelegate: artifacts.require('RocketMegapoolDelegate'),
    // Utils
    addressQueueStorage: artifacts.require('AddressQueueStorage'),
    addressSetStorage: artifacts.require('AddressSetStorage'),
};

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer');

if (network.name !== 'live' && network.name !== 'goerli') {
    // the linked list storage helper needs to be added as a network contract
    networkContracts.linkedListStorage = artifacts.require('LinkedListStorageHelper');
} else {
    networkContracts.linkedListStorage = artifacts.require('LinkedListStorage');
}

// Contract details to store into RocketStorage
const contracts = {};

// Instance contract ABIs
const abis = {
    // Minipool
    rocketMinipool: [artifacts.require('RocketMinipoolDelegate'), artifacts.require('RocketMinipoolBase')],
};

// Construct ABI for rocketMinipool
const rocketMinipoolAbi = []
    .concat(artifacts.require('RocketMinipoolDelegate').abi)
    .concat(artifacts.require('RocketMinipoolBase').abi)
    .filter(i => i.type !== 'fallback' && i.type !== 'receive');

rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'fallback' });
rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'receive' });

/*** Deployment **********************/


// Deploy Rocket Pool
export async function deployRocketPool() {
    // Set our web3 provider
    const network = hre.network;

    // Accounts
    let signers = await ethers.getSigners();
    let accounts = signers.map(signer => signer.address);

    const signer = signers[0];

    console.log(`Using network: ${network.name}`);
    console.log(`Deploying from: ${accounts[0]}`);
    console.log('\n');

    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');

    // Live deployment
    if (network.name === 'live') {
        // Casper live contract address
        let casperDepositAddress = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
        contracts.casperDeposit = {
            address: casperDepositAddress,
            abi: casperDepositABI,
            precompiled: true,
        };
        // Add our live RPL token address in place
        contracts.rocketTokenRPLFixedSupply.address = '0xb4efd85c19999d84251304bda99e90b92300bd93';
    }

    // Goerli test network
    else if (network.name === 'goerli') {
        // Casper deposit contract details
        const casperDepositAddress = '0xff50ed3d0ec03ac01d4c79aad74928bff48a7b2b';       // Prater
        contracts.casperDeposit = {
            address: casperDepositAddress,
            abi: casperDepositABI,
            precompiled: true,
        };
    }

    // Test network deployment
    else {
        // Precompiled - Casper Deposit Contract
        const casperDepositFactory = new ethers.ContractFactory(casperDepositABI, fs.readFileSync('./contracts/contract/casper/compiled/Deposit.bin').toString(), signer);
        const casperDepositContract = await casperDepositFactory.deploy();

        // Set the Casper deposit address
        let casperDepositAddress = casperDepositContract.target;

        // Store it in storage
        contracts.casperDeposit = {
            address: casperDepositAddress,
            abi: casperDepositABI,
            precompiled: true,
        };
    }

    // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
    const rocketStorageInstance = await rocketStorage.new();
    const rsTx = rocketStorageInstance.deploymentTransaction();
    const deployBlock = rsTx.blockNumber;

    // Deploy other contracts
    for (let contract in networkContracts) {
        // Only deploy if it hasn't been deployed already like a precompiled
        let instance;
        const abi = networkContracts[contract].abi;

        switch (contract) {
            // New RPL contract - pass storage address & existing RPL contract address
            case 'rocketTokenRPL':
                instance = await networkContracts[contract].new(rocketStorageInstance.target, (await networkContracts.rocketTokenRPLFixedSupply.deployed()).target);
                break;

            // Contracts with no constructor args
            case 'rocketMinipoolDelegate':
            case 'rocketNodeDistributorDelegate':
            case 'rocketMinipoolBase':
                instance = await networkContracts[contract].new();
                break;

            // All other contracts - pass storage address
            default:
                instance = await networkContracts[contract].new(rocketStorageInstance.target);
                // Slight hack to allow gas optimisation using immutable addresses for non-upgradable contracts
                if (contract === 'rocketVault' || contract === 'rocketTokenRETH') {
                    await rocketStorageInstance.setAddress(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]),
                        instance.target,
                    );
                }
                break;

        }

        contracts[contract] = {
            address: instance.target,
            abi: abi,
        };
    }

    // Register all other contracts with storage and store their abi
    const addContracts = async function() {
        const rocketStorageInstance = await rocketStorage.deployed();
        // Log RocketStorage
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage Address');
        console.log('     ' + rocketStorageInstance.target);
        // Add Rocket Storage to deployed contracts
        contracts.rocketStorage = {
            address: rocketStorageInstance.target,
            abi: rocketStorage.abi,
        };
        // Now process the rest
        for (let contract in contracts) {
            if (contracts.hasOwnProperty(contract)) {
                switch (contract) {
                    default:
                        const address = contracts[contract].address;
                        const abi = contracts[contract].abi;

                        // Log it
                        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage ' + contract + ' Address');
                        console.log('     ' + address);
                        // Register the contract address as part of the network
                        await rocketStorageInstance.setBool(
                            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.exists', address]),
                            true,
                        );
                        // Register the contract's name by address
                        await rocketStorageInstance.setString(
                            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.name', address]),
                            contract,
                        );
                        // Register the contract's address by name (rocketVault and rocketTokenRETH addresses already stored)
                        if (!(contract === 'rocketVault' || contract === 'rocketTokenRETH')) {
                            await rocketStorageInstance.setAddress(
                                ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]),
                                address,
                            );
                        }
                        // Compress and store the ABI by name
                        await rocketStorageInstance.setString(
                            ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                            compressABI(abi),
                        );
                        break;
                }
            }
        }
    };

    // Register ABI-only contracts
    const addABIs = async function() {
        for (let contract in abis) {
            if (abis.hasOwnProperty(contract)) {
                console.log('\x1b[31m%s\x1b[0m:', '   Set Storage ABI');
                console.log('     ' + contract);
                if (Array.isArray(abis[contract])) {
                    // Merge ABIs from multiple artifacts
                    let combinedAbi = [];
                    for (const artifact of abis[contract]) {
                        combinedAbi = combinedAbi.concat(artifact.abi);
                    }
                    // Compress and store the ABI
                    await rocketStorageInstance.setString(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                        compressABI(combinedAbi),
                    );
                } else {
                    // Compress and store the ABI
                    await rocketStorageInstance.setString(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                        compressABI(abis[contract].abi),
                    );
                }
            }
        }
    };

    // Run it
    console.log('\x1b[34m%s\x1b[0m', '  Deploy Contracts');
    console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
    await addContracts();
    console.log('\n');
    console.log('\x1b[34m%s\x1b[0m', '  Set ABI Only Storage');
    console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
    await addABIs();

    // Store deployed block
    console.log('\n');
    console.log('Setting `deploy.block` to ' + deployBlock);
    await rocketStorageInstance.setUint(
        ethers.solidityPackedKeccak256(['string'], ['deploy.block']),
        deployBlock,
    );

    // Set protocol version
    const protocolVersion = '1.3.0';
    console.log('Setting `protocol.version` to ' + protocolVersion);
    await rocketStorageInstance.setString(
        ethers.solidityPackedKeccak256(['string'], ['protocol.version']),
        protocolVersion,
    );

    // Disable direct access to storage now
    await rocketStorageInstance.setDeployedStatus();
    if (await rocketStorageInstance.getDeployedStatus() !== true) throw 'Storage Access Not Locked Down!!';

    // Log it
    console.log('\n');
    console.log('\x1b[32m%s\x1b[0m', '  Storage Direct Access For Owner Removed... Lets begin! :)');
    console.log('\n');

    // Deploy development help contracts
    if (network.name !== 'live' && network.name !== 'goerli') {
        let instance = await revertOnTransfer.new();
        revertOnTransfer.setAsDeployed(instance);
    }
};
