import {
    artifacts,
    RocketDAONodeTrusted, RocketDAONodeTrustedUpgrade,
    RocketDAOProposal,
    RocketUpgradeOneDotFive,
} from '../../test/_utils/artifacts';
import pako from 'pako';

const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

const networkContracts = {
    rocketMegapoolDelegate: artifacts.require('RocketMegapoolDelegate'),
    rocketDAOProtocolSettingsMegapool: artifacts.require('RocketDAOProtocolSettingsMegapool'),
    rocketNetworkRedemptions: artifacts.require('RocketNetworkRedemptions'),
    rocketDAOProtocolSettingsNetwork: artifacts.require('RocketDAOProtocolSettingsNetwork'),
    beaconStateVerifier: artifacts.require('BeaconStateVerifier'),
    rocketNetworkParticipation: artifacts.require('RocketNetworkParticipation'),
    rocketNetworkExit: artifacts.require('RocketNetworkExit'),

    rocketUpgradeOneDotFive: artifacts.require('RocketUpgradeOneDotFive'),
};

if (process.env.CHAIN === 'hardhat') {
    // Unit test helper contracts
    networkContracts.beaconStateVerifier = artifacts.require('BeaconStateVerifierMock');
}

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

export async function deployUpgrade(rocketStorageAddress) {
    let contracts = {};
    let addresses = {};
    let upgradeContract;

    const withdrawalRequestPredeployAddress = '0x00000961Ef480Eb55e80D19ad83579A64c007002';

    // Deploy other contracts
    for (let contract in networkContracts) {
        // Only deploy if it hasn't been deployed already like a precompiled
        let instance;
        const abi = networkContracts[contract].abi;

        switch (contract) {
            // Contracts with no constructor args
            case 'rocketMegapoolDelegate':
                instance = await networkContracts[contract].clone(rocketStorageAddress, withdrawalRequestPredeployAddress);
                addresses[contract] = instance.target;
                break;

            // Upgrade contract
            case 'rocketUpgradeOneDotFive':
                const setArgs = [
                    [
                        addresses.rocketMegapoolDelegate,
                        addresses.rocketDAOProtocolSettingsMegapool,
                        addresses.rocketNetworkRedemptions,
                        addresses.rocketDAOProtocolSettingsNetwork,
                        addresses.beaconStateVerifier,
                        addresses.rocketNetworkParticipation,
                        addresses.rocketNetworkExit,
                    ],
                    [
                        compressABI(networkContracts.rocketMegapoolDelegate.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsMegapool.abi),
                        compressABI(networkContracts.rocketNetworkRedemptions.abi),
                        compressABI(networkContracts.rocketDAOProtocolSettingsNetwork.abi),
                        compressABI(networkContracts.beaconStateVerifier.abi),
                        compressABI(networkContracts.rocketNetworkParticipation.abi),
                        compressABI(networkContracts.rocketNetworkExit.abi),
                    ],
                ];
                instance = await networkContracts[contract].new(rocketStorageAddress);
                upgradeContract = instance;
                await upgradeContract.set(...setArgs);
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

    return upgradeContract;
}

export async function executeUpgrade(owner, trustedNode, upgradeContract, rocketStorageAddress) {
    // Bootstrap add the upgrade contract and execute
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const rocketDAONodeTrustedUpgrade = await RocketDAONodeTrustedUpgrade.deployed();
    await rocketDAONodeTrusted.connect(owner).bootstrapUpgrade('addContract', 'rocketUpgradeOneDotFive', compressABI(RocketUpgradeOneDotFive.abi), upgradeContract.target);
    // Fetch the upgrade proposal ID and end time
    const upgradeProposalId = await rocketDAONodeTrustedUpgrade.getTotal();
    const upgradeProposalEnd = await rocketDAONodeTrustedUpgrade.getEnd(upgradeProposalId);
    // Wait for the pDAO veto period to pass
    await helpers.time.increaseTo(upgradeProposalEnd + 1n);
    // Execute the upgrade proposal
    await rocketDAONodeTrustedUpgrade.connect(trustedNode).execute(upgradeProposalId);
    // Execute the upgrade
    await upgradeContract.connect(owner).execute();
    // Reload contracts from deployment as some were upgraded
    await artifacts.loadFromDeployment(rocketStorageAddress);
}
