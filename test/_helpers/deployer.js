import { artifacts } from '../_utils/artifacts';
import hre from 'hardhat';
import { injectBNHelpers } from './bn';

const fs = require('fs');
const pako = require('pako');
const ethers = hre.ethers;

injectBNHelpers();

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

function loadABI(abiFilePath) {
    return JSON.parse(fs.readFileSync(abiFilePath));
}

function formatConstructorArgs(args) {
    return JSON.stringify(args, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value,
    );
}

const defaultOpts = {
    protocolVersion: '1.4',
    initialRevenueSplit: ['0.05'.ether, '0.09'.ether],
    depositAddress: null,
    fixedSupplyTokenAddress: null,
    genesisBlockTimestamp: 1606824023n,
    secondsPerSlot: 12n,
    beaconRootsHistoryBufferLength: 8192n,
    historicalRootOffset: 758n, // Mainnet value: CAPELLA_FORK_EPOCH * SLOTS_PER_EPOCH / SLOTS_PER_HISTORICAL_ROOT = 758
    beaconRoots: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02',
    logging: true,
};

const contractNameMap = {
    rocketVault: 'RocketVault',
    rocketTokenRPL: 'RocketTokenRPL',
    rocketTokenRPLFixedSupply: 'RocketTokenDummyRPL',
    rocketTokenRETH: 'RocketTokenRETH',
    rocketAuctionManager: 'RocketAuctionManager',
    rocketDepositPool: 'RocketDepositPool',
    rocketMinipoolDelegate: 'RocketMinipoolDelegate',
    rocketMinipoolManager: 'RocketMinipoolManager',
    rocketMinipoolQueue: 'RocketMinipoolQueue',
    rocketMinipoolPenalty: 'RocketMinipoolPenalty',
    rocketNetworkBalances: 'RocketNetworkBalances',
    rocketNetworkFees: 'RocketNetworkFees',
    rocketNetworkPrices: 'RocketNetworkPrices',
    rocketNetworkPenalties: 'RocketNetworkPenalties',
    rocketRewardsPool: 'RocketRewardsPool',
    rocketClaimDAO: 'RocketClaimDAO',
    rocketNodeDeposit: 'RocketNodeDeposit',
    rocketNodeManager: 'RocketNodeManager',
    rocketNodeStaking: 'RocketNodeStaking',
    rocketDAOProposal: 'RocketDAOProposal',
    rocketDAONodeTrusted: 'RocketDAONodeTrusted',
    rocketDAONodeTrustedProposals: 'RocketDAONodeTrustedProposals',
    rocketDAONodeTrustedActions: 'RocketDAONodeTrustedActions',
    rocketDAONodeTrustedUpgrade: 'RocketDAONodeTrustedUpgrade',
    rocketDAONodeTrustedSettingsMembers: 'RocketDAONodeTrustedSettingsMembers',
    rocketDAONodeTrustedSettingsProposals: 'RocketDAONodeTrustedSettingsProposals',
    rocketDAONodeTrustedSettingsMinipool: 'RocketDAONodeTrustedSettingsMinipool',
    rocketDAOProtocol: 'RocketDAOProtocol',
    rocketDAOProtocolProposals: 'RocketDAOProtocolProposals',
    rocketDAOProtocolActions: 'RocketDAOProtocolActions',
    rocketDAOProtocolSettingsInflation: 'RocketDAOProtocolSettingsInflation',
    rocketDAOProtocolSettingsRewards: 'RocketDAOProtocolSettingsRewards',
    rocketDAOProtocolSettingsAuction: 'RocketDAOProtocolSettingsAuction',
    rocketDAOProtocolSettingsNode: 'RocketDAOProtocolSettingsNode',
    rocketDAOProtocolSettingsNetwork: 'RocketDAOProtocolSettingsNetwork',
    rocketDAOProtocolSettingsDeposit: 'RocketDAOProtocolSettingsDeposit',
    rocketDAOProtocolSettingsMinipool: 'RocketDAOProtocolSettingsMinipool',
    rocketMerkleDistributorMainnet: 'RocketMerkleDistributorMainnet',
    rocketDAONodeTrustedSettingsRewards: 'RocketDAONodeTrustedSettingsRewards',
    rocketSmoothingPool: 'RocketSmoothingPool',
    rocketNodeDistributorFactory: 'RocketNodeDistributorFactory',
    rocketNodeDistributorDelegate: 'RocketNodeDistributorDelegate',
    rocketMinipoolFactory: 'RocketMinipoolFactory',
    rocketMinipoolBase: 'RocketMinipoolBase',
    rocketMinipoolBondReducer: 'RocketMinipoolBondReducer',
    rocketNetworkSnapshots: 'RocketNetworkSnapshots',
    rocketNetworkVoting: 'RocketNetworkVoting',
    rocketDAOProtocolSettingsProposals: 'RocketDAOProtocolSettingsProposals',
    rocketDAOProtocolVerifier: 'RocketDAOProtocolVerifier',
    rocketDAOSecurity: 'RocketDAOSecurity',
    rocketDAOSecurityActions: 'RocketDAOSecurityActions',
    rocketDAOSecurityProposals: 'RocketDAOSecurityProposals',
    rocketDAOProtocolSettingsSecurity: 'RocketDAOProtocolSettingsSecurity',
    rocketDAOProtocolProposal: 'RocketDAOProtocolProposal',
    rocketMegapoolFactory: 'RocketMegapoolFactory',
    rocketMegapoolProxy: 'RocketMegapoolProxy',
    rocketMegapoolManager: 'RocketMegapoolManager',
    rocketMegapoolDelegate: 'RocketMegapoolDelegate',
    rocketMegapoolPenalties: 'RocketMegapoolPenalties',
    rocketNetworkRevenues: 'RocketNetworkRevenues',
    rocketVoterRewards: 'RocketVoterRewards',
    rocketDAOProtocolSettingsMegapool: 'RocketDAOProtocolSettingsMegapool',
    addressQueueStorage: 'AddressQueueStorage',
    addressSetStorage: 'AddressSetStorage',
    beaconStateVerifier: 'BeaconStateVerifier',
    blockRoots: 'BlockRoots',
    linkedListStorage: 'LinkedListStorage',
};

export class RocketPoolDeployer {
    signer = null;
    rocketStorageInstance = null;
    contractPlan = {};
    deployedContracts = {};
    skippedContracts = [];
    logDepth = 0;
    buildInfos = {};
    deployBlock = null;

    stages = [];

    constructor(signer, opts = {}) {
        this.signer = signer;

        opts = { ...defaultOpts, ...opts };

        if (!opts.logging) {
            this.log = () => {};
        }

        // Setup default contract deployment plan
        this.contractPlan['rocketStorage'] = {
            constructorArgs: [],
            artifact: artifacts.require('RocketStorage'),
        };

        for (const contract in contractNameMap) {
            this.contractPlan[contract] = {
                constructorArgs: () => this.defaultConstructorArgs(),
                artifact: artifacts.require(contractNameMap[contract]),
            };
        }

        // Override constructor args on certain contracts
        this.contractPlan['rocketTokenRPL'].constructorArgs = () => [this.rocketStorageInstance.target, this.deployedContracts['rocketTokenRPLFixedSupply'].address];
        this.contractPlan['rocketMinipoolDelegate'].constructorArgs = [];
        this.contractPlan['rocketNodeDistributorDelegate'].constructorArgs = [];
        this.contractPlan['rocketMinipoolBase'].constructorArgs = [];
        this.contractPlan['blockRoots'].constructorArgs = [opts.genesisBlockTimestamp, opts.secondsPerSlot, opts.beaconRootsHistoryBufferLength, opts.beaconRoots];
        this.contractPlan['beaconStateVerifier'].constructorArgs = () => [this.rocketStorageInstance.target, opts.beaconRootsHistoryBufferLength, opts.historicalRootOffset];
        this.contractPlan['rocketMegapoolDelegate'].constructorArgs = () => [this.rocketStorageInstance.target, opts.genesisBlockTimestamp];

        // Setup deployment
        this.addStage('Deploy storage', 0, [
                async () => this.deployNetworkContract('rocketStorage'),
                async () => this.setString('protocol.version', opts.protocolVersion),
                async () => this.setUint('deploy.block', this.deployBlock),
            ],
        );

        if (opts.depositAddress === null) {
            this.addStage('Deploy deposit contract', 10, [
                    async () => this.deployDepositContract(),
                ],
            );
        } else {
            const abi = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
            this.addStage('Setup deposit contract', 10, [
                    async () => this.setNetworkContractAddress('casperDeposit', opts.depositAddress),
                    async () => this.setNetworkContractAbi('casperDeposit', abi),
                ],
            );
        }

        if (opts.fixedSupplyTokenAddress === null) {
            // Has to be deployed before RPL token as it's used in constructor
            this.addStage('Deploy dummy RPL fixed supply token', 20, [
                    async () => this.deployNetworkContract('rocketTokenRPLFixedSupply'),
                ],
            );
        } else {
            this.addStage('Setup RPL fixed supply', 20, [
                    async () => this.setNetworkContractAddress('rocketTokenRPLFixedSupply', opts.fixedSupplyTokenAddress),
                    async () => this.setNetworkContractAbi('rocketTokenRPLFixedSupply', artifacts.require('rocketTokenRPLFixedSupply').abi),
                ],
            );
            // No need to deploy this anymore
            this.skippedContracts.push('rocketTokenRPLFixedSupply');
        }

        this.addStage('Deploy immutable contracts', 30, [
                async () => this.deployNetworkContract('rocketVault'),
                async () => this.deployNetworkContract('rocketTokenRETH'),
            ],
        );

        this.addStage('Deploy remaining network contracts', 40, [
                async () => this.deployRemainingContracts(),
            ],
        );

        this.addStage('Add combined minipool and megapool ABI', 50, [
                async () => this.setNetworkContractAbi('rocketMinipool', compressABI(this.getMinipoolAbi())),
                async () => this.setNetworkContractAbi('rocketMegapool', compressABI(this.getMegapoolAbi())),
            ],
        );

        this.addStage('Initialise contracts', 60, [
                async () => await this.deployedContracts['rocketMegapoolFactory'].instance.initialise(),
                async () => await this.deployedContracts['rocketNetworkRevenues'].instance.initialise(...opts.initialRevenueSplit),
            ],
        );

        this.addStage('Lock storage', 100, [
                async () => this.setDeploymentStatus(),
            ],
        );
    }

    log(string = '\n', color = 'gray') {

        let colorCodes = {
            'white': 0,
            'gray': 37,
            'red': 31,
            'blue': 34,
            'green': 32,
        };

        console.log('%s\x1b[%sm%s\x1b[0m', ''.padEnd(this.logDepth, ' '), colorCodes[color], string);
    }

    addStage(name, priority, steps) {
        this.stages.push({
            name,
            priority,
            steps,
        });
    }

    defaultConstructorArgs() {
        return [this.rocketStorageInstance.target];
    }

    getMinipoolAbi() {
        // Construct ABI for rocketMinipool
        const rocketMinipoolAbi = []
            .concat(artifacts.require('RocketMinipoolDelegate').abi)
            .concat(artifacts.require('RocketMinipoolBase').abi)
            .filter(i => i.type !== 'fallback' && i.type !== 'receive');

        rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'fallback' });
        rocketMinipoolAbi.push({ stateMutability: 'payable', type: 'receive' });

        return rocketMinipoolAbi;
    }

    getMegapoolAbi() {
        // Construct ABI for rocketMegapool
        const rocketMegapoolAbi = []
            .concat(artifacts.require('RocketMegapoolDelegate').abi)
            .concat(artifacts.require('RocketMegapoolProxy').abi)
            .filter(i => i.type !== 'fallback' && i.type !== 'receive');

        rocketMegapoolAbi.push({ stateMutability: 'payable', type: 'fallback' });
        rocketMegapoolAbi.push({ stateMutability: 'payable', type: 'receive' });

        return rocketMegapoolAbi;
    }

    async setDeploymentStatus() {
        // Disable direct access to storage now
        this.log('- Locking down storage');
        await this.rocketStorageInstance.setDeployedStatus();
    }

    async setString(name, value) {
        this.log('- Setting string `' + name + '` to ' + value, 'white');
        await this.rocketStorageInstance.setString(
            ethers.solidityPackedKeccak256(['string'], [name]),
            value,
        );
    }

    async setUint(name, value) {
        this.log('- Setting uint `' + name + '` to ' + value, 'white');
        await this.rocketStorageInstance.setUint(
            ethers.solidityPackedKeccak256(['string'], [name]),
            value,
        );
    }

    async deployDepositContract() {
        this.log('- Deploying deposit contract', 'white');
        const abi = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
        const factory = new ethers.ContractFactory(abi, fs.readFileSync('./contracts/contract/casper/compiled/Deposit.bin').toString(), this.signer);
        const instance = await factory.deploy();
        const address = instance.target;

        this.log(`  - Deployed to ${address}`);

        await this.setNetworkContractAddress('casperDeposit', address);
        await this.setNetworkContractAbi('casperDeposit', abi);
    }

    async setNetworkContractAddress(name, address) {
        this.log(`- Setting address for "${name}" in storage to ${address}`);
        // Register the contract address as part of the network
        await this.rocketStorageInstance.setBool(
            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.exists', address]),
            true,
        );
        // Register the contract's name by address
        await this.rocketStorageInstance.setString(
            ethers.solidityPackedKeccak256(['string', 'address'], ['contract.name', address]),
            name,
        );
        // Register the contract's address by name (rocketVault and rocketTokenRETH addresses already stored)
        await this.rocketStorageInstance.setAddress(
            ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', name]),
            address,
        );
    }

    async setNetworkContractAbi(name, abi) {
        let compressedAbi = abi;
        if (Array.isArray(compressedAbi)) {
            compressedAbi = compressABI(abi);
        }
        this.log(`- Setting abi for "${name}" in storage to ${compressedAbi.substr(0, 40)}...`);
        // Compress and store the ABI by name
        await this.rocketStorageInstance.setString(
            ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', name]),
            compressedAbi,
        );
    }

    async deployRemainingContracts() {
        for (const contract in this.contractPlan) {

            if (this.deployedContracts.hasOwnProperty(contract)) {
                this.log(`- Skipping already deployed ${contract}`, 'red');
                continue;
            }

            if (this.skippedContracts.includes(contract)) {
                this.log(`- Skipping ${contract}`, 'red');
                continue;
            }

            await this.deployNetworkContract(contract);
        }
    }

    async deployNetworkContract(name) {
        const plan = this.contractPlan[name];
        if (!plan) {
            throw Error(`No contract deployment plan for ${name}`);
        }

        let artifact = plan.artifact;
        let abi = artifact.abi;

        this.log(`- Deploying "${name}"`, 'white');

        let constructorArgs = typeof plan.constructorArgs === 'function' ? plan.constructorArgs() : plan.constructorArgs;

        this.logDepth += 2;

        this.log(`- Constructor args = ${formatConstructorArgs(constructorArgs)}`);

        // Deploy and log result
        const instance = await artifact.newImmediate(...constructorArgs);
        const rsTx = await instance.deploymentTransaction();
        const address = instance.target;
        this.log(`- Deployed to ${address} @ ${rsTx.hash}`);

        // Encode the constructor args
        const iface = new ethers.Interface(abi);
        const encodedConstructorArgs = iface.encodeDeploy(constructorArgs);

        // Special case for rocketStorage as it's used for all value setting
        if (name === 'rocketStorage') {
            this.rocketStorageInstance = instance;
            const receipt = await rsTx.wait();
            this.deployBlock = receipt.blockNumber;
        }

        await this.setNetworkContractAddress(name, address);
        await this.setNetworkContractAbi(name, abi);

        // Add to deployed contracts
        this.deployedContracts[name] = {
            artifact: artifact,
            constructorArgs: encodedConstructorArgs,
            abi: abi,
            address: address,
            instance: instance,
        };

        this.logDepth -= 2;
    }

    async bootstrapProtocolDAOSetting(contractName, settingPath, value) {
        const rocketDAOProtocol = this.deployedContracts['rocketDAOProtocol'].instance;

        if (ethers.isAddress(value)) {
            this.log(`- Bootstrap pDAO setting address \`${settingPath}\` = "${value}" on \`${contractName}\``, 'white');
            await rocketDAOProtocol.bootstrapSettingAddress(contractName, settingPath, value);
        } else {
            if (typeof (value) == 'number' || typeof (value) == 'string' || typeof (value) == 'bigint') {
                this.log(`- Bootstrap pDAO setting uint \`${settingPath}\` = ${value} on \`${contractName}\``, 'white');
                await rocketDAOProtocol.bootstrapSettingUint(contractName, settingPath, value);
            } else if (typeof (value) == 'boolean') {
                this.log(`- Bootstrap pDAO setting bool \`${settingPath}\` = ${value} on \`${contractName}\``, 'white');
                await rocketDAOProtocol.bootstrapSettingBool(contractName, settingPath, value);
            }
        }
    }

    async bootstrapProtocolDAOClaimers(trustedNodePerc, protocolPerc, nodePerc) {
        const rocketDAOProtocol = this.deployedContracts['rocketDAOProtocol'].instance;
        this.log(`- Bootstrap pDAO setting claimers: oDAO = ${ethers.formatEther(trustedNodePerc * 100n)}%, protocol = ${ethers.formatEther(protocolPerc * 100n)}%, node = ${ethers.formatEther(nodePerc * 100n)}% `, 'white');
        await rocketDAOProtocol.bootstrapSettingClaimers(trustedNodePerc, protocolPerc, nodePerc);
    }

    async deploy() {
        this.log(`Deploying RocketPool`, 'green');

        // Sort stages by priority
        this.stages.sort((a, b) => a.priority - b.priority);

        // Iterate over stages and execute steps
        for (let l = 0; l < this.stages.length; ++l) {
            const stage = this.stages[l];
            this.log(`# ${stage.name}`, 'blue');

            this.logDepth += 2;

            // Iterate over steps and execute
            for (let i = 0; i < stage.steps.length; ++i) {
                await stage.steps[i]();
            }

            this.logDepth -= 2;

            this.log();
        }

        return this.deployedContracts;
    }
}