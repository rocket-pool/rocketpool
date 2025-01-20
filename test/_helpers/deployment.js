import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
    artifacts,
    RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation, RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode, RocketMegapoolFactory, RocketNetworkRevenues, RocketStorage,
} from '../_utils/artifacts';
import fs from 'fs';
import pako from 'pako';
import { beginHiddenCallStack } from '@babel/core/lib/errors/rewrite-stack-trace';

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
    return JSON.parse(fs.readFileSync(abiFilePath).toString('utf-8'));
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
    rocketNetworkRevenues: artifacts.require('RocketNetworkRevenues'),
    // Utils
    addressQueueStorage: artifacts.require('AddressQueueStorage'),
    addressSetStorage: artifacts.require('AddressSetStorage'),
    beaconStateVerifier: artifacts.require('BeaconStateVerifier'),
    blockRoots: artifacts.require('BlockRoots'),
    linkedListStorage: artifacts.require('LinkedListStorage'),
};

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer');

if (network.name === 'hardhat') {
    // Unit test helper contracts
    networkContracts.linkedListStorage = artifacts.require('LinkedListStorageHelper');
    networkContracts.megapoolUpgradeHelper = artifacts.require('MegapoolUpgradeHelper');
    networkContracts.beaconStateVerifier = artifacts.require('BeaconStateVerifierMock');
    networkContracts.blockRoots = artifacts.require('BlockRootsMock');
}

// Contract details to store into RocketStorage
const contracts = {};

// Construct ABI for rocketMinipool
const rocketMinipoolAbi = []
    .concat(artifacts.require('RocketMinipoolDelegate').abi)
    .concat(artifacts.require('RocketMinipoolBase').abi)
    .filter(i => i.type !== 'fallback' && i.type !== 'receive');

rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'fallback' });
rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'receive' });

// Megapool ABI
const delegateAbi = artifacts.require('RocketMegapoolDelegate').abi;
const proxyAbi = artifacts.require('RocketMegapoolProxy').abi;
const rocketMegapoolAbi = [...delegateAbi, ...proxyAbi].filter(fragment => fragment.type !== 'constructor');

// Instance contract ABIs
const abis = {
    rocketMinipool: rocketMinipoolAbi,
    rocketMegapool: rocketMegapoolAbi,
};

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

    // Holesky test network
    else if (network.name === 'testnet') {
        // Holesky deposit contract
        const casperDepositAddress = '0x4242424242424242424242424242424242424242';
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

            case 'blockRoots':
                if (network.name === 'hardhat') {
                    instance = await networkContracts[contract].new();
                } else {
                    const genesisBlockTimestamp = 1695902400n;
                    const secondsPerSlot = 12n;
                    const beaconRootsHistoryBufferLength = 8191n;
                    const beaconRoots = '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02';
                    instance = await networkContracts[contract].new(genesisBlockTimestamp, secondsPerSlot, beaconRootsHistoryBufferLength, beaconRoots);
                }
                break;

            // All other contracts - pass storage address
            default:
                instance = await networkContracts[contract].new(rocketStorageInstance.target);
                // Slight hack to allow gas optimisation using immutable addresses for non-upgradable contracts
                if (contract === 'rocketVault' || contract === 'rocketTokenRETH') {
                    await (await rocketStorageInstance.setAddress(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]),
                        instance.target,
                    )).wait();
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
                        await (await rocketStorageInstance.setBool(
                            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.exists', address]),
                            true,
                        )).wait();
                        // Register the contract's name by address
                        await (await rocketStorageInstance.setString(
                            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.name', address]),
                            contract,
                        )).wait();
                        // Register the contract's address by name (rocketVault and rocketTokenRETH addresses already stored)
                        if (!(contract === 'rocketVault' || contract === 'rocketTokenRETH')) {
                            await (await rocketStorageInstance.setAddress(
                                ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]),
                                address,
                            )).wait();
                        }
                        // Compress and store the ABI by name
                        await (await rocketStorageInstance.setString(
                            ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                            compressABI(abi),
                        )).wait();
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
                        combinedAbi = combinedAbi.concat(artifact);
                    }
                    // Compress and store the ABI
                    await (await rocketStorageInstance.setString(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                        compressABI(combinedAbi),
                    )).wait();
                } else {
                    // Compress and store the ABI
                    await (await rocketStorageInstance.setString(
                        ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contract]),
                        compressABI(abis[contract]),
                    )).wait();
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
    await (await rocketStorageInstance.setUint(
        ethers.solidityPackedKeccak256(['string'], ['deploy.block']),
        deployBlock,
    )).wait();

    // Set protocol version
    const protocolVersion = '1.4';
    console.log('Setting `protocol.version` to ' + protocolVersion);
    await (await rocketStorageInstance.setString(
        ethers.solidityPackedKeccak256(['string'], ['protocol.version']),
        protocolVersion,
    )).wait();

    // Initialise rocketMegapoolFactory
    const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
    await (await rocketMegapoolFactory.initialise()).wait();

    // Initialise revenues contracts
    const rocketNetworkRevenues = await RocketNetworkRevenues.deployed();
    await (await rocketNetworkRevenues.initialise()).wait();

    // Disable direct access to storage now
    await (await rocketStorageInstance.setDeployedStatus()).wait();
    if (await rocketStorageInstance.getDeployedStatus() !== true) throw 'Storage Access Not Locked Down!!';

    // Log it
    console.log('\n');
    console.log('\x1b[32m%s\x1b[0m', '  Storage Direct Access For Owner Removed... Lets begin! :)');
    console.log('\n');

    // Deploy development help contracts
    if (network.name === 'hardhat') {
        let instance = await revertOnTransfer.new();
        revertOnTransfer.setAsDeployed(instance);
    }
};
