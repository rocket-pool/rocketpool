import { artifacts, RocketStorage } from '../../test/_utils/artifacts';
import pako from 'pako';

const hre = require('hardhat');

const network = hre.network;

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
    rocketDAOProtocolSettingsNode: artifacts.require('RocketDAOProtocolSettingsNode'),
    rocketDAOProtocolSettingsDeposit: artifacts.require('RocketDAOProtocolSettingsDeposit'),
    rocketDAOProtocolSettingsNetwork: artifacts.require('RocketDAOProtocolSettingsNetwork'),
    rocketDAOProtocolSettingsSecurity: artifacts.require('RocketDAOProtocolSettingsSecurity'),
    rocketDAOProtocolSettingsMegapool: artifacts.require('RocketDAOProtocolSettingsMegapool'),
    rocketDAOSecurityProposals: artifacts.require('RocketDAOSecurityProposals'),
    rocketNetworkRevenues: artifacts.require('RocketNetworkRevenues'),
    rocketNetworkSnapshots: artifacts.require('RocketNetworkSnapshots'),
    rocketVoterRewards: artifacts.require('RocketVoterRewards'),
    blockRoots: artifacts.require('BlockRoots'),
    beaconStateVerifier: artifacts.require('BeaconStateVerifier'),

    rocketUpgradeOneDotFour: artifacts.require('RocketUpgradeOneDotFour'),
};

if (network.name === 'hardhat') {
    // Unit test helper contracts
    networkContracts.beaconStateVerifier = artifacts.require('BeaconStateVerifierMock');
    networkContracts.blockRoots = artifacts.require('BlockRootsMock');
}

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

export async function deployUpgrade(rocketStorageAddress) {
    let contracts = {};
    let addresses = {};
    let upgradeContract;

    // Deploy other contracts
    for (let contract in networkContracts) {
        // Only deploy if it hasn't been deployed already like a precompiled
        let instance;
        const abi = networkContracts[contract].abi;

        switch (contract) {
            // Contracts with no constructor args
            case 'rocketMinipoolDelegate':
                instance = await networkContracts[contract].clone();
                addresses[contract] = instance.target;
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
                addresses[contract] = instance.target;
                break;

            // Upgrade contract
            case 'rocketUpgradeOneDotFour':
                instance = await networkContracts[contract].new(rocketStorageAddress);
                const args = [
                    [
                        addresses.rocketMegapoolDelegate,
                        addresses.rocketMegapoolFactory,
                        addresses.rocketMegapoolProxy,
                        addresses.rocketMegapoolManager,
                        addresses.rocketNodeManager,
                        addresses.rocketNodeDeposit,
                        addresses.rocketNodeStaking,
                        addresses.rocketDepositPool,
                        addresses.linkedListStorage,
                        addresses.rocketDAOProtocolSettingsNode,
                        addresses.rocketDAOProtocolSettingsDeposit,
                        addresses.rocketDAOProtocolSettingsNetwork,
                        addresses.rocketDAOProtocolSettingsSecurity,
                        addresses.rocketDAOProtocolSettingsMegapool,
                        addresses.rocketDAOSecurityProposals,
                        addresses.rocketNetworkRevenues,
                        addresses.rocketNetworkSnapshots,
                        addresses.rocketVoterRewards,
                        addresses.blockRoots,
                        addresses.beaconStateVerifier,
                    ],
                    [
                        compressABI(networkContracts.rocketMegapoolDelegate.abi),
                        compressABI(networkContracts.rocketMegapoolFactory.abi),
                        compressABI(networkContracts.rocketMegapoolProxy.abi),
                        compressABI(networkContracts.rocketMegapoolManager.abi),
                        compressABI(networkContracts.rocketNodeManager.abi),
                        compressABI(networkContracts.rocketNodeDeposit.abi),
                        compressABI(networkContracts.rocketNodeStaking.abi),
                        compressABI(networkContracts.rocketDepositPool.abi),
                        compressABI(networkContracts.linkedListStorage.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsNode.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsDeposit.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsNetwork.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsSecurity.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsMegapool.abi),
                        compressABI(networkContracts.rocketDAOSecurityProposals.abi),
                        compressABI(networkContracts.rocketNetworkRevenues.abi),
                        compressABI(networkContracts.rocketNetworkSnapshots.abi),
                        compressABI(networkContracts.rocketVoterRewards.abi),
                        compressABI(networkContracts.blockRoots.abi),
                        compressABI(networkContracts.beaconStateVerifier.abi),
                    ],
                ];
                await instance.set(...args);
                upgradeContract = instance;
                break;

            // All other contracts - pass storage address
            default:
                instance = await networkContracts[contract].clone(rocketStorageAddress);
                addresses[contract] = instance.target;
                break;
        }

        contracts[contract] = {
            instance: instance,
            address: instance.target,
            abi: abi,
        };
    }

    console.log(addresses);

    return upgradeContract;
}
