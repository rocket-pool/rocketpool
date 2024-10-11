import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { RocketDAOProtocolSettingsProposals, RocketNodeStaking, RocketStorage } from '../_utils/artifacts';
import { artifacts } from '../_utils/artifacts';
import { setDaoNodeTrustedBootstrapUpgrade } from '../dao/scenario-dao-node-trusted-bootstrap';
import pako from 'pako';
import { assertBN } from '../_helpers/bn';
import { nodeStakeRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import { shouldRevert } from '../_utils/testing';
import { globalSnapShot } from '../_utils/snapshotting';
import * as assert from 'node:assert';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketUpgradeOneDotThreeDotOne', () => {
        let owner,
            node1,
            node2,
            node3,
            node4,
            random;

        let RocketUpgradeOneDotThreeDotOne = artifacts.require('RocketUpgradeOneDotThreeDotOne');
        let rocketUpgradeOneDotThreeDotOne;

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

            rocketUpgradeOneDotThreeDotOne: RocketUpgradeOneDotThreeDotOne,
        };

        let addresses = {};

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node1,
                node2,
                node3,
                node4,
                random,
            ] = await ethers.getSigners();

            function compressABI(abi) {
                return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
            }

            const rocketStorageInstance = await RocketStorage.deployed();

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
                        instance = await networkContracts[contract].new(rocketStorageInstance.target);
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
                        rocketUpgradeOneDotThreeDotOne = instance;
                        break;

                    // All other contracts - pass storage address
                    default:
                        instance = await networkContracts[contract].clone(rocketStorageInstance.target);
                        addresses[contract] = instance.target;
                        break;
                }

                contracts[contract] = {
                    instance: instance,
                    address: instance.target,
                    abi: abi,
                };
            }

            rocketUpgradeOneDotThreeDotOne = contracts.rocketUpgradeOneDotThreeDotOne.instance;
        });

        async function executeUpgrade() {
            const rocketStorage = await RocketStorage.deployed();

            // Lock contract and execute upgrade
            await rocketUpgradeOneDotThreeDotOne.lock();
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketUpgradeOneDotThreeDotOne', RocketUpgradeOneDotThreeDotOne.abi, rocketUpgradeOneDotThreeDotOne.target, { from: owner });
            await rocketUpgradeOneDotThreeDotOne.connect(owner).execute();

            // Confirm version string updated
            const versionString = await rocketStorage.getString(ethers.solidityPackedKeccak256(['string'], ['protocol.version']));
            assert.equal(versionString, '1.3.1');
        }

        it(printTitle('upgrade', 'cannot execute twice'), async () => {
            await executeUpgrade();
            await shouldRevert(rocketUpgradeOneDotThreeDotOne.execute(), 'Was able to execute twice', 'Already executed');
        });

        it(printTitle('upgrade', 'updates addresses correctly'), async () => {
            const rocketStorage = await RocketStorage.deployed();

            await executeUpgrade();

            for (let contract in addresses) {
                const key = ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contract]);
                const address = await rocketStorage['getAddress(bytes32)'](key);

                assert.equal(address, addresses[contract]);
            }
        });

        it(printTitle('upgrade', 'adjusts quorum parameter correctly'), async () => {
            await executeUpgrade();

            const rocketDAOProtocolSettingsProposal = await RocketDAOProtocolSettingsProposals.deployed();
            const proposalQuorum = await rocketDAOProtocolSettingsProposal.getProposalQuorum.call();

            assertBN.equal(proposalQuorum, '0.30'.ether);
        });

        it(printTitle('upgrade', 'applies ETH matched corrections'), async () => {
            // Get contracts
            const rocketNodeStaking = await RocketNodeStaking.deployed();

            // Register nodes
            const nodes = [node1, node2, node3, node4];
            const correctionAmounts = ['-8'.ether, '-4'.ether, '2'.ether, '-32'.ether];

            let ethMatchedBefores = [];

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                // Register node
                await registerNode({ from: node });

                // Deposit and create minipools
                let count = BigInt(i + 1);
                let rplStake = minipoolRplStake * count;
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, { from: node });

                await userDeposit({ from: random, value: '16'.ether * count });
                for (let j = 0; j < count; j++) {
                    await createMinipool({ from: node, value: '16'.ether });
                }

                // Confirm prior ETH matched
                const ethMatchedBefore = await rocketNodeStaking.getNodeETHMatched(node);
                assertBN.equal(ethMatchedBefore, '16'.ether * count);

                ethMatchedBefores[i] = ethMatchedBefore;

                // Add a correction
                await rocketUpgradeOneDotThreeDotOne.addCorrection(node, correctionAmounts[i]);

                // Check correction
                const correction = await rocketUpgradeOneDotThreeDotOne.corrections(i);
                assertBN.equal(correction[1], correctionAmounts[i]);
                assert.equal(correction[0], node.address);
            }

            // Execute upgrade
            await executeUpgrade();

            // Confirm changes
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                const ethMatchedAfter = await rocketNodeStaking.getNodeETHMatched(node);
                assertBN.equal(ethMatchedAfter, ethMatchedBefores[i] + correctionAmounts[i]);
            }
        });
    });
}
