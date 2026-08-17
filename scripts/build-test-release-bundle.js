#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const contractNames = [
    'RocketStorage',
    'RocketVault',
    'RocketTokenRPL',
    'RocketTokenDummyRPL',
    'RocketTokenRETH',
    'RocketAuctionManager',
    'RocketDepositPool',
    'RocketMinipoolDelegate',
    'RocketMinipoolManager',
    'RocketMinipoolQueue',
    'RocketMinipoolPenalty',
    'RocketNetworkBalances',
    'RocketNetworkFees',
    'RocketNetworkPrices',
    'RocketNetworkPenalties',
    'RocketRewardsPool',
    'RocketClaimDAO',
    'RocketNodeDeposit',
    'RocketNodeManager',
    'RocketNodeStaking',
    'RocketDAOProposal',
    'RocketDAONodeTrusted',
    'RocketDAONodeTrustedProposals',
    'RocketDAONodeTrustedActions',
    'RocketDAONodeTrustedUpgrade',
    'RocketDAONodeTrustedSettingsMembers',
    'RocketDAONodeTrustedSettingsProposals',
    'RocketDAONodeTrustedSettingsMinipool',
    'RocketDAOProtocol',
    'RocketDAOProtocolProposals',
    'RocketDAOProtocolActions',
    'RocketDAOProtocolSettingsInflation',
    'RocketDAOProtocolSettingsRewards',
    'RocketDAOProtocolSettingsAuction',
    'RocketDAOProtocolSettingsNode',
    'RocketDAOProtocolSettingsNetwork',
    'RocketDAOProtocolSettingsDeposit',
    'RocketDAOProtocolSettingsMinipool',
    'RocketMerkleDistributorMainnet',
    'RocketDAONodeTrustedSettingsRewards',
    'RocketSmoothingPool',
    'RocketNodeDistributorFactory',
    'RocketNodeDistributorDelegate',
    'RocketMinipoolFactory',
    'RocketMinipoolBase',
    'RocketMinipoolBondReducer',
    'RocketNetworkSnapshots',
    'RocketNetworkVoting',
    'RocketDAOProtocolSettingsProposals',
    'RocketDAOProtocolVerifier',
    'RocketDAOSecurity',
    'RocketDAOSecurityActions',
    'RocketDAOSecurityProposals',
    'RocketDAOProtocolSettingsSecurity',
    'RocketDAOProtocolProposal',
    'AddressQueueStorage',
    'AddressSetStorage',
];

const releaseConfig = {
    '1.3.1': {
        commit: '8d4d5c0f1b810f97ca42cd1ceece0e7c81eb81ee',
        compilers: ['0.7.6', '0.8.18'],
        contracts: contractNames,
    },
    '1.4': {
        commit: 'fb7d9c428dc3dddc3fbd3e634e3cb365655df89e',
        compilers: ['0.7.6', '0.8.30'],
        contracts: contractNames.concat([
            'RocketNetworkSnapshotsTime',
            'RocketMegapoolFactory',
            'RocketMegapoolProxy',
            'RocketMegapoolManager',
            'RocketMegapoolDelegate',
            'RocketMegapoolPenalties',
            'RocketNetworkRevenues',
            'RocketDAOProtocolSettingsMegapool',
            'RocketDAOSecurityUpgrade',
            'BeaconStateVerifier',
            'LinkedListStorage',
            'RocketUpgradeOneDotFour',
        ]),
    },
};

function usage() {
    console.error('Usage: build-test-release-bundle.js <release> <compiled checkout> <output directory>');
    process.exit(1);
}

function walk(directory) {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...walk(absolute));
        else result.push(absolute);
    }
    return result;
}

function stableHash(value) {
    return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normaliseAbi(abi) {
    return abi.map(item => {
        const result = { ...item };
        delete result.gas;
        return result;
    });
}

const [, , release, checkout, outputDirectory] = process.argv;
if (!release || !checkout || !outputDirectory || !releaseConfig[release]) usage();

const config = releaseConfig[release];
const artifactsRoot = path.resolve(checkout, 'artifacts', 'contracts');
const candidates = walk(artifactsRoot)
    .filter(file => file.endsWith('.json') && !file.endsWith('.dbg.json'));

const byContractName = new Map();
for (const file of candidates) {
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!artifact.contractName) continue;
    const existing = byContractName.get(artifact.contractName);
    if (existing) {
        throw new Error(`Ambiguous artifact ${artifact.contractName}: ${existing}, ${file}`);
    }
    byContractName.set(artifact.contractName, file);
}

const artifactOutput = path.resolve(outputDirectory, 'artifacts');
fs.mkdirSync(artifactOutput, { recursive: true });

const manifest = {
    schemaVersion: 1,
    release,
    source: {
        tag: `v${release}`,
        commit: config.commit,
    },
    compilers: config.compilers,
    artifacts: {},
};

for (const contractName of config.contracts) {
    const inputFile = byContractName.get(contractName);
    if (!inputFile) throw new Error(`Artifact not found: ${contractName}`);

    const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const artifact = {
        _format: input._format,
        contractName: input.contractName,
        sourceName: input.sourceName,
        abi: normaliseAbi(input.abi),
        bytecode: input.bytecode,
        deployedBytecode: input.deployedBytecode,
        linkReferences: input.linkReferences,
        deployedLinkReferences: input.deployedLinkReferences,
    };
    const contents = `${JSON.stringify(artifact)}\n`;
    const fileName = `${contractName}.json`;
    fs.writeFileSync(path.join(artifactOutput, fileName), contents);
    manifest.artifacts[contractName] = {
        file: `artifacts/${fileName}`,
        integrity: stableHash(contents),
        sourceName: artifact.sourceName,
    };
}

const depositAbi = JSON.parse(fs.readFileSync(path.resolve(checkout, 'contracts/contract/casper/compiled/Deposit.abi'), 'utf8'));
const depositBytecode = `0x${fs.readFileSync(path.resolve(checkout, 'contracts/contract/casper/compiled/Deposit.bin'), 'utf8').trim().replace(/^0x/, '')}`;
const depositArtifact = {
    contractName: 'DepositContract',
    sourceName: 'contracts/contract/casper/compiled/Deposit',
    abi: normaliseAbi(depositAbi),
    bytecode: depositBytecode,
    deployedBytecode: '0x',
    linkReferences: {},
    deployedLinkReferences: {},
};
const depositContents = `${JSON.stringify(depositArtifact)}\n`;
fs.writeFileSync(path.join(artifactOutput, 'DepositContract.json'), depositContents);
manifest.artifacts.DepositContract = {
    file: 'artifacts/DepositContract.json',
    integrity: stableHash(depositContents),
    sourceName: depositArtifact.sourceName,
};

const unsignedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
manifest.integrity = stableHash(unsignedManifest);
fs.writeFileSync(path.resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${Object.keys(manifest.artifacts).length} artifacts for Rocket Pool ${release}`);
