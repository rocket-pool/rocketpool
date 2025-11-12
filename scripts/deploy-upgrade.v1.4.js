const pako = require('pako');
const { RocketDAONodeTrusted, RocketUpgradeOneDotFour, artifacts } = require('../test/_utils/artifacts.js');
const hre = require('hardhat');
const { EtherscanVerifier } = require('../test/_helpers/verify');
const fs = require('fs');
const path = require('path');
const ethers = hre.ethers;

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

function formatConstructorArgs(args) {
    return JSON.stringify(args, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value,
    );
}

const rocketStorageAddress = process.env.ROCKET_STORAGE;
let rocketUpgradeAddress;

const CHAINS = {
    'hoodi': {
        genesisBlockTimestamp: 1742213400n,
        slotsPerHistoricalRoot: 8192n,
        beaconRoots: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02',
        genesisValidatorRoot: '0x212f13fc4df078b6cb7db228f1c8307566dcecf900867401a92023d7ba99cb5f',
        forkSlots: [
            0n,             // Altair
            0n,             // Bellatrix
            0n,             // Capella
            0n,             // Deneb
            2048n * 32n,    // Electra
        ],
    },
    'mainnet': {
        genesisBlockTimestamp: 1695902400n,
        slotsPerHistoricalRoot: 8192n,
        beaconRoots: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02',
        genesisValidatorRoot: '0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95',
        forkSlots: [
            74240n * 32n,   // Altair
            144896n * 32n,  // Bellatrix
            194048n * 32n,  // Capella
            269568n * 32n,  // Deneb
            364032n * 32n,  // Electra
        ],
    },
    'private': {
        genesisBlockTimestamp: 1762861080n,
        slotsPerHistoricalRoot: 8192n,
        beaconRoots: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02',
        genesisValidatorRoot: '0xec9caf9aad26d20776fbd9e03b61dee7e7bd155a32d1593d43c47df730c40f14',
        forkSlots: [
            0n, // Altair
            0n, // Bellatrix
            0n, // Capella
            0n, // Deneb
            0n, // Electra
        ],
    },
};

const networkContracts = {
    rocketMegapoolDelegate: artifacts.require('RocketMegapoolDelegate'),
    rocketMegapoolFactory: artifacts.require('RocketMegapoolFactory'),
    rocketMegapoolProxy: artifacts.require('RocketMegapoolProxy'),
    rocketMegapoolManager: artifacts.require('RocketMegapoolManager'),
    rocketNodeManager: artifacts.require('RocketNodeManager'),
    rocketNodeDeposit: artifacts.require('RocketNodeDeposit'),
    rocketNodeStaking: artifacts.require('RocketNodeStaking'),
    rocketDepositPool: artifacts.require('RocketDepositPool'),
    linkedListStorage: artifacts.require('LinkedListStorage'),
    rocketDAOProtocol: artifacts.require('RocketDAOProtocol'),
    rocketDAOProtocolProposals: artifacts.require('RocketDAOProtocolProposals'),
    rocketDAOProtocolSettingsNode: artifacts.require('RocketDAOProtocolSettingsNode'),
    rocketDAOProtocolSettingsDeposit: artifacts.require('RocketDAOProtocolSettingsDeposit'),
    rocketDAOProtocolSettingsNetwork: artifacts.require('RocketDAOProtocolSettingsNetwork'),
    rocketDAOProtocolSettingsSecurity: artifacts.require('RocketDAOProtocolSettingsSecurity'),
    rocketDAOProtocolSettingsMegapool: artifacts.require('RocketDAOProtocolSettingsMegapool'),
    rocketDAOProtocolSettingsMinipool: artifacts.require('RocketDAOProtocolSettingsMinipool'),
    rocketDAOSecurityUpgrade: artifacts.require('RocketDAOSecurityUpgrade'),
    rocketDAOSecurityProposals: artifacts.require('RocketDAOSecurityProposals'),
    rocketDAONodeTrustedUpgrade: artifacts.require('RocketDAONodeTrustedUpgrade'),
    rocketNetworkRevenues: artifacts.require('RocketNetworkRevenues'),
    rocketNetworkBalances: artifacts.require('RocketNetworkBalances'),
    rocketNetworkSnapshots: artifacts.require('RocketNetworkSnapshots'),
    rocketNetworkPenalties: artifacts.require('RocketNetworkPenalties'),
    rocketRewardsPool: artifacts.require('RocketRewardsPool'),
    beaconStateVerifier: artifacts.require('BeaconStateVerifier'),
    rocketNodeDistributorDelegate: artifacts.require('RocketNodeDistributorDelegate'),
    rocketClaimDAO: artifacts.require('RocketClaimDAO'),
    rocketMinipoolBondReducer: artifacts.require('RocketMinipoolBondReducer'),
    rocketMinipoolManager: artifacts.require('RocketMinipoolManager'),
    rocketNetworkVoting: artifacts.require('RocketNetworkVoting'),
    rocketMerkleDistributorMainnet: artifacts.require('RocketMerkleDistributorMainnet'),
    rocketMegapoolPenalties: artifacts.require('RocketMegapoolPenalties'),
    rocketNetworkSnapshotsTime: artifacts.require('RocketNetworkSnapshotsTime'),
};

async function deployUpgrade(rocketStorageAddress) {
    const [signer] = await ethers.getSigners();

    const genesisBlockTimestamp = CHAINS[process.env.CHAIN].genesisBlockTimestamp;
    const slotsPerHistoricalRoot = CHAINS[process.env.CHAIN].slotsPerHistoricalRoot;
    const beaconRoots = CHAINS[process.env.CHAIN].beaconRoots;
    const forkSlots = CHAINS[process.env.CHAIN].forkSlots;
    const genesisValidatorRoot = CHAINS[process.env.CHAIN].genesisValidatorRoot;

    const deployedContracts = {};
    const contractPlan = {};

    async function deployNetworkContract(name) {
        const plan = contractPlan[name];
        if (!plan) {
            throw Error(`No contract deployment plan for ${name}`);
        }

        let artifact = plan.artifact;
        let abi = artifact.abi;

        console.log(`- Deploying "${name}"`);

        let constructorArgs = typeof plan.constructorArgs === 'function' ? plan.constructorArgs() : plan.constructorArgs;
        console.log(`- Constructor args = ${formatConstructorArgs(constructorArgs)}`);

        // Deploy and log result
        const instance = await artifact.newImmediate(...constructorArgs);
        const rsTx = await instance.deploymentTransaction();
        const address = instance.target;
        console.log(`Deployed to ${address} @ ${rsTx.hash}`);
        console.log();

        // Encode the constructor args
        const iface = new ethers.Interface(abi);
        const encodedConstructorArgs = iface.encodeDeploy(constructorArgs);

        // Add to deployed contracts
        deployedContracts[name] = {
            artifact: artifact,
            constructorArgs: encodedConstructorArgs,
            abi: abi,
            address: address,
            instance: instance,
        };
    }

    // Setup contract plan
    for (let contract in networkContracts) {
        switch (contract) {
            case 'rocketNodeDistributorDelegate':
                contractPlan[contract] = {
                    artifact: networkContracts[contract],
                    constructorArgs: [],
                };
                break;

            case 'beaconStateVerifier':
                contractPlan[contract] = {
                    artifact: networkContracts[contract],
                    constructorArgs: [rocketStorageAddress, slotsPerHistoricalRoot, forkSlots, beaconRoots, genesisBlockTimestamp, genesisValidatorRoot],
                };
                break;

            // All other contracts - pass storage address
            default:
                contractPlan[contract] = {
                    artifact: networkContracts[contract],
                    constructorArgs: [rocketStorageAddress],
                };
                break;
        }
    }

    contractPlan['RocketUpgradeOneDotFour'] = {
        artifact: artifacts.require('RocketUpgradeOneDotFour'),
        constructorArgs: () => {
            return [
                rocketStorageAddress,
            ];
        },
    };

    // Deploy contracts
    for (let contract in networkContracts) {
        await deployNetworkContract(contract);
    }

    // Deploy upgrade
    await deployNetworkContract('RocketUpgradeOneDotFour');

    // Set
    const upgradeContract = deployedContracts['RocketUpgradeOneDotFour'].instance;
    const setAddressesA = [
        deployedContracts.rocketMegapoolDelegate.address,
        deployedContracts.rocketMegapoolFactory.address,
        deployedContracts.rocketMegapoolProxy.address,
        deployedContracts.rocketMegapoolManager.address,
        deployedContracts.rocketNodeManager.address,
        deployedContracts.rocketNodeDeposit.address,
        deployedContracts.rocketNodeStaking.address,
        deployedContracts.rocketDepositPool.address,
        deployedContracts.linkedListStorage.address,
        deployedContracts.rocketDAOProtocol.address,
        deployedContracts.rocketDAOProtocolProposals.address,
        deployedContracts.rocketDAOProtocolSettingsNode.address,
        deployedContracts.rocketDAOProtocolSettingsDeposit.address,
        deployedContracts.rocketDAOProtocolSettingsNetwork.address,
        deployedContracts.rocketDAOProtocolSettingsSecurity.address,
        deployedContracts.rocketDAOProtocolSettingsMegapool.address,
        deployedContracts.rocketDAOProtocolSettingsMinipool.address,
    ];
    const setAddressesB = [
        deployedContracts.rocketDAOSecurityUpgrade.address,
        deployedContracts.rocketDAOSecurityProposals.address,
        deployedContracts.rocketDAONodeTrustedUpgrade.address,
        deployedContracts.rocketNetworkRevenues.address,
        deployedContracts.rocketNetworkBalances.address,
        deployedContracts.rocketNetworkSnapshots.address,
        deployedContracts.rocketNetworkPenalties.address,
        deployedContracts.rocketRewardsPool.address,
        deployedContracts.beaconStateVerifier.address,
        deployedContracts.rocketNodeDistributorDelegate.address,
        deployedContracts.rocketClaimDAO.address,
        deployedContracts.rocketMinipoolBondReducer.address,
        deployedContracts.rocketMinipoolManager.address,
        deployedContracts.rocketNetworkVoting.address,
        deployedContracts.rocketMerkleDistributorMainnet.address,
        deployedContracts.rocketMegapoolPenalties.address,
        deployedContracts.rocketNetworkSnapshotsTime.address,
    ];
    const setAbisA = [
        compressABI(networkContracts.rocketMegapoolDelegate.abi),
        compressABI(networkContracts.rocketMegapoolFactory.abi),
        compressABI(networkContracts.rocketMegapoolProxy.abi),
        compressABI(networkContracts.rocketMegapoolManager.abi),
        compressABI(networkContracts.rocketNodeManager.abi),
        compressABI(networkContracts.rocketNodeDeposit.abi),
        compressABI(networkContracts.rocketNodeStaking.abi),
        compressABI(networkContracts.rocketDepositPool.abi),
        compressABI(networkContracts.linkedListStorage.abi),
        compressABI(networkContracts.rocketDAOProtocol.abi),
        compressABI(networkContracts.rocketDAOProtocolProposals.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsNode.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsDeposit.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsNetwork.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsSecurity.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsMegapool.abi),
        compressABI(networkContracts.rocketDAOProtocolSettingsMinipool.abi),
    ];
    const setAbisB = [
        compressABI(networkContracts.rocketDAOSecurityUpgrade.abi),
        compressABI(networkContracts.rocketDAOSecurityProposals.abi),
        compressABI(networkContracts.rocketDAONodeTrustedUpgrade.abi),
        compressABI(networkContracts.rocketNetworkRevenues.abi),
        compressABI(networkContracts.rocketNetworkBalances.abi),
        compressABI(networkContracts.rocketNetworkSnapshots.abi),
        compressABI(networkContracts.rocketNetworkPenalties.abi),
        compressABI(networkContracts.rocketRewardsPool.abi),
        compressABI(networkContracts.beaconStateVerifier.abi),
        compressABI(networkContracts.rocketNodeDistributorDelegate.abi),
        compressABI(networkContracts.rocketClaimDAO.abi),
        compressABI(networkContracts.rocketMinipoolBondReducer.abi),
        compressABI(networkContracts.rocketMinipoolManager.abi),
        compressABI(networkContracts.rocketNetworkVoting.abi),
        compressABI(networkContracts.rocketMerkleDistributorMainnet.abi),
        compressABI(networkContracts.rocketMegapoolPenalties.abi),
        compressABI(networkContracts.rocketNetworkSnapshotsTime.abi),
    ];
    await upgradeContract.connect(signer).setA(setAddressesA, setAbisA);
    await upgradeContract.connect(signer).setB(setAddressesB, setAbisB);

    return deployedContracts;
}

async function deploy() {
    const [signer] = await ethers.getSigners();

    console.log();
    console.log('# Deploying');
    console.log();

    console.log(` - Deploying from ${signer.address}`);

    // Deploy upgrade
    {
        const contracts = await deployUpgrade(rocketStorageAddress);

        // Compile deployment information for saving
        const deploymentData = {
            deployer: signer.address,
            chain: process.env.CHAIN,
            verification: [],
            addresses: {},
            buildInfos: {},
        };

        // Compile set of build infos
        const buildInfoMap = {};
        for (const contract in contracts) {
            const artifact = contracts[contract].artifact;
            const buildInfo = hre.artifacts.getBuildInfoSync(`${artifact.sourceName}:${artifact.contractName}`);
            deploymentData.buildInfos[buildInfo.id] = buildInfo;
            buildInfoMap[contract] = buildInfo.id;
        }

        // Compile list of information needed for verification
        for (const contract in contracts) {
            const artifact = contracts[contract].artifact;
            deploymentData.verification.push({
                sourceName: artifact.sourceName,
                contractName: artifact.contractName,
                address: contracts[contract].address,
                constructorArgs: contracts[contract].constructorArgs,
                buildInfoId: buildInfoMap[contract],
            });
            deploymentData.addresses[artifact.contractName] = contracts[contract].address;
        }

        // Save deployment data
        const deployFile = 'deployments' + path.sep + process.env.CHAIN + '_' + (new Date().toISOString()) + '.json';
        if (!fs.existsSync('deployments')) {
            fs.mkdirSync('deployments');
        }
        const jsonDeploymentData = JSON.stringify(deploymentData, null, 2);
        fs.writeFileSync(deployFile, jsonDeploymentData, 'utf8');
        fs.writeFileSync('deployments' + path.sep + 'latest.json', jsonDeploymentData, 'utf8');

        console.log(' - Deployment data saved to `' + deployFile + '`');

        rocketUpgradeAddress = contracts['RocketUpgradeOneDotFour'].address;
        console.log(` - Upgrade contract deployed to: ${rocketUpgradeAddress}`);
    }
}

async function bootstrap() {
    console.log();
    console.log('# Bootstrapping upgrade');
    console.log();

    const [signer] = await ethers.getSigners();
    await artifacts.loadFromDeployment(rocketStorageAddress);
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    await rocketDAONodeTrusted.connect(signer).bootstrapUpgrade('addContract', 'rocketUpgradeOneDotFour', compressABI(RocketUpgradeOneDotFour.abi), rocketUpgradeAddress);
}

async function execute() {
    console.log();
    console.log('# Executing upgrade');
    console.log();

    const [signer] = await ethers.getSigners();
    const upgradeContract = await RocketUpgradeOneDotFour.at(rocketUpgradeAddress);
    await upgradeContract.connect(signer).execute();
}

async function verify() {
    const deploymentData = JSON.parse(fs.readFileSync('deployments/latest.json').toString('utf-8'));

    // Verify all deployed contracts
    const verifierOpts = {
        chain: process.env.CHAIN,
        preamble: process.env.PREAMBLE !== null ? fs.readFileSync(process.cwd() + path.sep + process.env.PREAMBLE, 'utf8') : '',
        apiKey: process.env.ETHERSCAN_API_KEY,
    };
    const verifier = new EtherscanVerifier(deploymentData.buildInfos, verifierOpts);
    const verificationResults = await verifier.verifyAll(deploymentData.verification);

    console.log();
    console.log('# Verification results');
    console.log();

    for (const contract in verificationResults) {
        const guid = verificationResults[contract];
        if (guid === null) {
            console.log(`  - ${contract}: Failed to submit`);
        } else {
            const status = await verifier.getVerificationStatus(verificationResults[contract]);
            console.log(`  - ${contract}: ${status.result}`);
        }
    }

    console.log();
}

async function go() {
    // Deploy contracts
    await deploy();

    // Optionally verify on Etherscan
    if (process.env.VERIFY === 'true') {
        await verify();
    }

    // Bootstrap upgrade contract
    if (process.env.BOOTSTRAP === 'true') {
        await bootstrap();

        // Execute upgrade
        if (process.env.EXECUTE === 'true') {
            await execute();
        }
    }
}

go().then(() => process.exit(0));
