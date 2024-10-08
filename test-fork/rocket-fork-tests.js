import { afterEach, before, beforeEach, describe, it } from 'mocha';
import {
    artifacts,
    RocketDAONodeTrusted,
    RocketDAONodeTrustedProposals,
    RocketDAOProposal,
    RocketStorage,
    RocketUpgradeOneDotThreeDotOne,
} from '../test/_utils/artifacts';
import { voteStates } from '../test/dao/scenario-dao-proposal';
import { injectBNHelpers } from '../test/_helpers/bn';
import pako from 'pako';
import * as assert from 'assert';
import { endSnapShot, startSnapShot } from '../test/_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

const rocketStorageAddress = process.env.MAINNET_ROCKET_STORAGE || '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46';

injectBNHelpers();
beforeEach(startSnapShot);
afterEach(endSnapShot);

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

describe('Fork Mainnet', () => {
    let guardian;
    let odao;
    let rocketStorage;
    let rocketUpgradeOneDotOneDotThree;
    let rocketDAONodeTrustedProposals;
    let rocketDAOProposal;

    const networkContracts = {
        rocketDAOProposal: artifacts.require('RocketDAOProposal'),
        rocketDAOProtocolProposal: artifacts.require('RocketDAOProtocolProposal'),
        rocketDAOProtocolVerifier: artifacts.require('RocketDAOProtocolVerifier'),
        rocketDAOProtocolSettingsProposals: artifacts.require('RocketDAOProtocolSettingsProposals'),
        rocketDAOProtocolSettingsAuction: artifacts.require('RocketDAOProtocolSettingsAuction'),
        rocketMinipoolManager: artifacts.require('RocketMinipoolManager'),
        rocketNodeStaking: artifacts.require('RocketNodeStaking'),
        rocketMinipoolDelegate: artifacts.require('RocketMinipoolDelegate'),
        rocketNodeDeposit: artifacts.require('RocketNodeDeposit'),
        rocketNetworkVoting: artifacts.require('RocketNetworkVoting'),

        rocketUpgradeOneDotThreeDotOne: artifacts.require('RocketUpgradeOneDotThreeDotOne'),
    };

    let addresses = {};

    async function getContract(artifact, name) {
        const key = ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', name]);
        const address = await rocketStorage['getAddress(bytes32)'](key);
        return artifact.at(address);
    }

    async function deployUpgrade(rocketStorageAddress) {
        let contracts = {};

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

                // Upgrade contract
                case 'rocketUpgradeOneDotThreeDotOne':
                    instance = await networkContracts[contract].new(rocketStorageAddress);
                    const args = [
                        [
                            addresses.rocketDAOProposal,
                            addresses.rocketDAOProtocolProposal,
                            addresses.rocketDAOProtocolVerifier,
                            addresses.rocketDAOProtocolSettingsProposals,
                            addresses.rocketDAOProtocolSettingsAuction,
                            addresses.rocketMinipoolManager,
                            addresses.rocketNodeStaking,
                            addresses.rocketMinipoolDelegate,
                            addresses.rocketNodeDeposit,
                            addresses.rocketNetworkVoting,
                        ],
                        [
                            compressABI(networkContracts.rocketDAOProposal.abi),
                            compressABI(networkContracts.rocketDAOProtocolProposal.abi),
                            compressABI(networkContracts.rocketDAOProtocolVerifier.abi),
                            compressABI(networkContracts.rocketDAOProtocolSettingsProposals.abi),
                            compressABI(networkContracts.rocketDAOProtocolSettingsAuction.abi),
                            compressABI(networkContracts.rocketMinipoolManager.abi),
                            compressABI(networkContracts.rocketNodeStaking.abi),
                            compressABI(networkContracts.rocketMinipoolDelegate.abi),
                            compressABI(networkContracts.rocketNodeDeposit.abi),
                            compressABI(networkContracts.rocketNetworkVoting.abi),
                        ],
                    ];
                    await instance.set(...args);
                    rocketUpgradeOneDotOneDotThree = instance;
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
    }

    before(async () => {

        rocketStorage = RocketStorage.at(rocketStorageAddress);
        console.log('Rocket storage:', rocketStorage.target);

        // Fetch and impersonate guardian
        let guardianAddress = await rocketStorage.getGuardian();
        guardian = await ethers.getImpersonatedSigner(guardianAddress);
        console.log('Guardian:', guardian.address);

        // Fetch all odao members and impersonate them
        let rocketDAONodeTrusted = await getContract(RocketDAONodeTrusted, 'rocketDAONodeTrusted');
        const memberCount = await rocketDAONodeTrusted.getMemberCount();
        const odaoAddresses = await Promise.all([...Array(Number(memberCount)).keys()].map(i => rocketDAONodeTrusted.getMemberAt(i)));
        odao = await Promise.all(odaoAddresses.map(address => ethers.getImpersonatedSigner(address)));

        // Make sure everyone has enough ETH
        await helpers.setBalance(guardian.address, '50'.ether);
        for (let i = 0; i < odao.length; i++) {
            await helpers.setBalance(odao[i].address, '50'.ether);
        }

        // Deploy the upgrade
        console.log('Deploying upgrade contract');
        await deployUpgrade(rocketStorageAddress);

        // Fetch needed contracts
        rocketDAONodeTrustedProposals = await getContract(RocketDAONodeTrustedProposals, 'rocketDAONodeTrustedProposals');
        rocketDAOProposal = await getContract(RocketDAOProposal, 'rocketDAOProposal');
    });

    async function proposeUpgrade() {
        // Construct the proposal payload
        let proposalCalldata = rocketDAONodeTrustedProposals.interface.encodeFunctionData(
            'proposalUpgrade',
            [
                'addContract',
                'rocketUpgradeOneDotOneDotThree',
                compressABI(RocketUpgradeOneDotThreeDotOne.abi),
                rocketUpgradeOneDotOneDotThree.target,
            ],
        );

        // Add the proposal
        await rocketDAONodeTrustedProposals.connect(odao[0]).propose('Upgrade to v1.3.1', proposalCalldata);
        return Number(await rocketDAOProposal.getTotal());
    }

    async function voteForProposal(proposalId) {
        // Now increase time until the proposal is 'active' and can be voted on
        const proposalStartTime = Number(await rocketDAOProposal.getStart(proposalId));
        let timeCurrent = await helpers.time.latest();
        await helpers.time.increase((proposalStartTime - timeCurrent) + 2);

        // Calculate required quorum
        const votesRequired = await rocketDAOProposal.getVotesRequired(proposalId);

        // Vote from the impersonated oDAO accounts
        for (let i = 0; i < odao.length; i++) {
            await rocketDAONodeTrustedProposals.connect(odao[i]).vote(proposalId, voteStates.For);

            const votesFor = await rocketDAOProposal.getVotesFor(proposalId);

            if (votesFor >= votesRequired) {
                break;
            }
        }
    }

    async function executeProposal(proposalId) {
        await rocketDAONodeTrustedProposals.connect(odao[0]).execute(proposalId);
    }

    async function executeUpgrade() {
        await rocketUpgradeOneDotOneDotThree.connect(guardian).execute();
    }

    async function voteInAndExecute() {
        const proposalId = await proposeUpgrade();
        await voteForProposal(proposalId);
        await executeProposal(proposalId);
        await executeUpgrade();
    }

    describe('After upgrade', () => {
        before(async () => {
            await rocketUpgradeOneDotOneDotThree.lock();
            console.log('Raising proposal and executing upgrade');
            await voteInAndExecute();
        });

        it('Has correct protocol.version', async () => {
            const versionString = await rocketStorage.getString(ethers.solidityPackedKeccak256(['string'], ['protocol.version']));
            assert.equal(versionString, '1.3.1');
        });

        it('Updated network contract addresses', async () => {
            for (const contract in addresses) {
                const key = ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]);
                const address = await rocketStorage['getAddress(bytes32)'](key);
                assert.equal(address, addresses[contract]);
            }
        });
    });
});